# app/sync.py
import json, datetime as dt
import asyncpg, httpx
from typing import Any, List, Dict
from .db import acquire  # kept in case you use it elsewhere
import hashlib

DATA_API = "https://data-api.polymarket.com"

def _extract_trades_list(payload: Any) -> List[Dict]:
    if payload is None:
        return []
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        for key in ("data", "trades", "results", "items"):
            if key in payload and isinstance(payload[key], list):
                return payload[key]
    return []

async def fetch_trades_page(user: str, limit=500, offset=0, taker_only=False) -> List[Dict]:
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.get(
            f"{DATA_API}/trades",
            params={"user": user, "limit": limit, "offset": offset, "takerOnly": str(taker_only).lower()},
        )
        r.raise_for_status()
        return _extract_trades_list(r.json())

# --- helpers: add these near the top, replacing your _trade_id/_trade_ts_ms ---



# helpers
from typing import Any, Dict, Iterable, Optional

def _get_first(d: Dict, keys: Iterable[str]) -> Any:
    for k in keys:
        if k in d and d[k] is not None:
            return d[k]
    return None

def _get_nested(d: Dict, paths: Iterable[Iterable[str]]) -> Any:
    for path in paths:
        cur = d
        ok = True
        for p in path:
            if isinstance(cur, dict) and p in cur and cur[p] is not None:
                cur = cur[p]
            else:
                ok = False
                break
        if ok:
            return cur
    return None

def _as_ms(v: Any) -> Optional[int]:
    if isinstance(v, (int, float)):
        vi = int(v)
        return vi if vi >= 10_000_000_000 else vi * 1000
    if isinstance(v, str):
        s = v.strip()
        try:
            f = float(s)
            vi = int(f)
            return vi if vi >= 10_000_000_000 else vi * 1000
        except Exception:
            pass
        try:
            from datetime import datetime
            s = s.replace("Z", "+00:00")
            return int(datetime.fromisoformat(s).timestamp() * 1000)
        except Exception:
            return None
    return None

def _trade_ts_ms(t: Dict) -> Optional[int]:
    v = _get_first(t, (
        "createdAt","created_at","created","created_time",
        "executedAt","executed_at",
        "timestamp","timestampMs","timeMs",
        "time","filledAt",
        "blockTimestamp","block_time","blockTime",
    ))
    if v is None:
        v = _get_nested(t, [
            ("trade","createdAt"), ("trade","timestamp"),
            ("fill","createdAt"),  ("fill","timestamp"),
            ("transaction","timestamp"),
        ])
    return _as_ms(v)

def _trade_id(t: Dict) -> Optional[str]:
    # direct IDs
    v = _get_first(t, ("id","trade_id","tradeId","event_id"))
    if v is not None:
        return str(v)

    # compose from tx hash + index variants
    txh = _get_first(t, ("transactionHash","txHash","hash","tx_hash")) \
          or _get_nested(t, [("transaction","hash"),("tx","hash")])
    idx = _get_first(t, ("logIndex","log_index","eventIndex","event_index","logIdx","outcomeIndex")) \
          or _get_nested(t, [("event","index")])
    if txh is not None and idx is not None:
        return f"{txh}:{idx}"

    # otherwise tx hash + timestamp
    ts = _get_first(t, ("timestamp","timestampMs","timeMs","time","createdAt","created_at"))
    if txh is not None and ts is not None:
        return f"{txh}:{_as_ms(ts)}"

    # last resort: stable hash of the object
    try:
        h = hashlib.sha1(json.dumps(t, sort_keys=True, separators=(",",":")).encode()).hexdigest()
        return f"h:{h}"
    except Exception:
        return None



def _normalize_side(raw: Any, outcome: Any = None) -> str:
    if raw is None and isinstance(outcome, str):
        raw = outcome  # sometimes APIs provide outcome "Yes"/"No"

    s = str(raw).strip().lower() if raw is not None else ""
    if s in {"buy", "bid", "long", "yes", "y"}:
        return "buy"
    if s in {"sell", "ask", "short", "no", "n"}:
        return "sell"
    # fallback: default to buy (or change to raise)
    return "buy"

def normalize_trade(t: Dict, default_user: str = "") -> Dict:
    price = float(t.get("price", 0) or 0)
    size  = float(t.get("size", 0) or 0)
    tid   = _trade_id(t) or ""
    ts_ms = _trade_ts_ms(t)

    market_id = t.get("conditionId") or t.get("market_id") or t.get("condition_id") or ""
    token_id = (
        t.get("tokenId") or t.get("token_id") or
        (f"{market_id}:{t.get('outcomeIndex')}" if market_id and t.get("outcomeIndex") is not None else "")
    )
    user_addr = t.get("user") or t.get("address") or t.get("proxyWallet") or default_user or ""
    side = _normalize_side(t.get("side"), t.get("outcome"))

    return {
        "trade_id": tid,
        "user_address": user_addr,
        "market_id": market_id,
        "token_id": token_id,
        "side": side,  # <-- normalized
        "price": price,
        "size": size,
        "quote": price * size,
        "taker": bool(t.get("taker", True)),
        "traded_at_ms": ts_ms or 0,
        "raw": t,
    }



# ---------- Use DB FUNCTIONS wherever possible ----------

async def upsert_trades_bulk(conn: asyncpg.Connection, rows: list[dict]) -> int:
    if not rows:
        return 0
    # Call your SQL function (expects jsonb)
    return await conn.fetchval("select upsert_trades_bulk($1::jsonb)", json.dumps(rows))

async def set_watermark(conn: asyncpg.Connection, addr: str, ts_ms: int, trade_id: str):
    # Update watermark (also updates cached last_trade_* in user_sync_meta via your SQL func)
    ts = dt.datetime.fromtimestamp(ts_ms / 1000, dt.timezone.utc)
    await conn.execute("select set_user_watermark($1,$2,$3)", addr, ts, trade_id)

    # Mark sync completion / idle using your SQL func
    now = dt.datetime.now(dt.timezone.utc)
    await conn.execute(
        "select set_user_meta_synced($1,$2,$3,$4,$5,$6)",
        addr, now, ts, trade_id, "idle", None
    )

async def incremental_refresh(conn: asyncpg.Connection, addr: str, wm_ts: dt.datetime | None, wm_id: str | None):
    offset, page_limit = 0, 500
    newest_ts = None; newest_id = None

    for _ in range(5):
        page = await fetch_trades_page(addr, limit=page_limit, offset=offset, taker_only=False)
        if not page:
            break

        stop_idx = None
        for i, t in enumerate(page):
            t_ts_ms = _trade_ts_ms(t); t_id = _trade_id(t)
            if t_ts_ms is None or not t_id:
                continue
            t_ts = dt.datetime.fromtimestamp(t_ts_ms / 1000, dt.timezone.utc)
            if wm_ts and (t_ts < wm_ts or (t_ts == wm_ts and t_id == wm_id)):
                stop_idx = i
                break

        slice_ = page if stop_idx is None else page[:stop_idx]
        if slice_:
            norm = [normalize_trade(t) for t in slice_]
            norm = [n for n in norm if n["trade_id"] and n["traded_at_ms"]]
            if norm:
                await upsert_trades_bulk(conn, norm)
                if newest_ts is None:
                    newest_ts = norm[0]["traded_at_ms"]; newest_id = norm[0]["trade_id"]

        if stop_idx is not None or len(page) < page_limit:
            break
        offset += page_limit

    if newest_ts and newest_id:
        await set_watermark(conn, addr, newest_ts, newest_id)

async def fetch_head_trade(addr: str) -> Dict | None:
    page = await fetch_trades_page(addr, limit=1, offset=0, taker_only=False)
    return page[0] if page else None

async def head_check_and_maybe_refresh(addr: str):
    addr = addr.strip().lower()
    from .db import get_pool
    pool = get_pool()
    async with pool.acquire() as conn:
        now = dt.datetime.now(dt.timezone.utc)

        head = await fetch_head_trade(addr)
        if not head:
            # No trades: mark idle via function
            await conn.execute(
                "select set_user_meta_synced($1,$2,$3,$4,$5,$6)",
                addr, now, None, None, "idle", None
            )
            return

        head_ts_ms = _trade_ts_ms(head)
        head_id    = _trade_id(head)
        if head_ts_ms is None or not head_id:
            # include a peek at keys to debug shape differences
            keys = sorted(list(head.keys()))[:20]
            await conn.execute(
                "select set_user_meta_synced($1,$2,$3,$4,$5,$6)",
                addr,
                dt.datetime.now(dt.timezone.utc),
                None, None,
                "error",
                f"Head missing ts/id; keys={keys}"
            )
            return


        wm = await conn.fetchrow(
            "select last_trade_at, last_trade_id from user_trade_sync where user_address=$1", addr
        )
        wm_ts = wm["last_trade_at"] if wm else None
        wm_id = wm["last_trade_id"] if wm else None

        head_ts = dt.datetime.fromtimestamp(head_ts_ms / 1000, dt.timezone.utc)
        if wm_ts and (head_ts < wm_ts or (head_ts == wm_ts and head_id == wm_id)):
            # Already up-to-date → mark idle via function with existing watermark
            await conn.execute(
                "select set_user_meta_synced($1,$2,$3,$4,$5,$6)",
                addr, now, wm_ts, wm_id, "idle", None
            )
            return

        # Mark running (reuse the same func; last_sync=now, status='running')
        await conn.execute(
            "select set_user_meta_synced($1,$2,$3,$4,$5,$6)",
            addr, now, wm_ts, wm_id, "running", None
        )

        try:
            await incremental_refresh(conn, addr, wm_ts, wm_id)
        except Exception as e:
            await conn.execute(
                "select set_user_meta_synced($1,$2,$3,$4,$5,$6)",
                addr, dt.datetime.now(dt.timezone.utc), wm_ts, wm_id, "error", str(e)[:500]
            )
            raise
