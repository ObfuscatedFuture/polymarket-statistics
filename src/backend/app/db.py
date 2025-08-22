# src/backend/app/db.py
import os
import ssl
import asyncio
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncIterator, Optional, Dict, Any

import asyncpg
from dotenv import load_dotenv
import certifi

# Load env explicitly from src/backend/.env
ENV_PATH = Path(__file__).resolve().parents[1] / ".env"
load_dotenv(dotenv_path=ENV_PATH)

_pool: Optional[asyncpg.Pool] = None
_pool_lock = asyncio.Lock()

def _build_ssl_context() -> ssl.SSLContext:
    """
    Strict TLS by default using certifi.
    Env overrides:
      - EXTRA_CA_BUNDLE=/path/to/corp_or_proxy_ca.pem  (optional)
      - SSL_TRUST=system  -> use system trust store instead of certifi
      - ALLOW_INSECURE_DEV=1  -> disable verification (DEV ONLY)
    """
    if os.getenv("ALLOW_INSECURE_DEV") == "1":
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        return ctx

    trust = os.getenv("SSL_TRUST", "certifi").lower()
    if trust == "system":
        ctx = ssl.create_default_context(purpose=ssl.Purpose.SERVER_AUTH)
    else:
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        ctx.load_verify_locations(cafile=certifi.where())

    extra_ca = os.getenv("EXTRA_CA_BUNDLE")
    if extra_ca and Path(extra_ca).exists():
        ctx.load_verify_locations(cafile=extra_ca)

    ctx.check_hostname = True
    ctx.verify_mode = ssl.CERT_REQUIRED
    return ctx

def _conn_kwargs(ssl_ctx) -> Dict[str, Any]:
    """
    Prefer DSN if SUPABASE_DB_URL is provided; otherwise use discrete params.
    This avoids URL-encoding headaches for passwords.
    """
    dsn = os.getenv("SUPABASE_DB_URL")
    if dsn:
        # Ensure DSN includes sslmode=require
        if "sslmode=" not in dsn:
            dsn = dsn + ("&" if "?" in dsn else "?") + "sslmode=require"
        return dict(dsn=dsn, ssl=ssl_ctx)

    # Discrete params path (recommended)
    pwd = os.getenv("SUPABASE_DB_PASSWORD")
    if not pwd:
        raise RuntimeError("SUPABASE_DB_PASSWORD not set in environment/.env")

    return dict(
        host=os.getenv("SUPABASE_DB_HOST", "db.fzafgpdupgnjzlvagswp.supabase.co"),
        port=int(os.getenv("SUPABASE_DB_PORT", "5432")),
        user=os.getenv("SUPABASE_DB_USER", "postgres"),
        password=pwd,
        database=os.getenv("SUPABASE_DB_NAME", "postgres"),
        ssl=ssl_ctx,
    )

async def init_pool() -> asyncpg.Pool:
    global _pool
    if _pool is not None:
        return _pool

    async with _pool_lock:
        if _pool is not None:
            return _pool

        ssl_ctx = _build_ssl_context()

        min_size = int(os.getenv("DB_POOL_MIN", "1"))
        max_size = int(os.getenv("DB_POOL_MAX", "5"))  # keep modest for Supabase

        try:
            _pool = await asyncpg.create_pool(
                min_size=min_size,
                max_size=max_size,
                **_conn_kwargs(ssl_ctx),
            )
            # Optional: quick sanity ping
            async with _pool.acquire() as conn:
                await conn.execute("select 1")
        except ssl.SSLCertVerificationError as e:
            tips = (
                "TLS verify failed. If you're on a VPN/AV/proxy with TLS inspection, "
                "export its root CA PEM and point EXTRA_CA_BUNDLE to it. "
                "Temporary dev-only bypass: ALLOW_INSECURE_DEV=1"
            )
            raise RuntimeError(f"SSL verification failed: {e}\n{tips}") from e

        return _pool

def get_pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("DB pool not initialized — call init_pool() on startup.")
    return _pool

async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None

@asynccontextmanager
async def acquire() -> AsyncIterator[asyncpg.Connection]:
    pool = get_pool()
    conn = await pool.acquire()
    try:
        yield conn
    finally:
        await pool.release(conn)
