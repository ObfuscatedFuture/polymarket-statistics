# app/sync.py
import json, datetime as dt
import asyncpg, httpx
from typing import Any, List, Dict, Optional

from .db import acquire  # kept in case you use it elsewhere
import hashlib

DATA_API = "https://data-api.polymarket.com"

GAMMA_API = "https://gamma-api.polymarket.com"

def _extract_markets_list(payload: Any) -> List[Dict]:
    if payload is None:
        return []
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        for key in ("data", "markets", "results", "items"):
            v = payload.get(key)
            if isinstance(v, list):
                return v
    return []

def _get(d: Dict, *keys: str, default=None):
    for k in keys:
        if k in d and d[k] is not None:
            return d[k]
    return default

def _parse_iso_ts(s: Any) -> Optional[str]:
    """Return ISO timestamp string (UTC) or None; keep as text for DB to cast."""
    if not isinstance(s, str):
        return None
    try:
        s2 = s.replace("Z", "+00:00")
        from datetime import datetime, timezone
        t = datetime.fromisoformat(s2)
        return t.astimezone(timezone.utc).isoformat()
    except Exception:
        return None

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

async def fetch_markets_by_ids(market_ids: List[str], batch=50) -> List[Dict]:
    out: List[Dict] = []
    if not market_ids:
        return out
    async with httpx.AsyncClient(timeout=20) as c:
        for i in range(0, len(market_ids), batch):
            ids = market_ids[i:i+batch]
            # Gamma supports comma-separated ids
            r = await c.get(f"{GAMMA_API}/markets", params={"ids": ",".join(ids)})
            r.raise_for_status()
            out.extend(_extract_markets_list(r.json()))
    return out



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
    
async def upsert_markets_bulk(conn: asyncpg.Connection, rows: List[Dict]) -> int:
    if not rows:
        return 0
    # Create this SQL function in your DB:
    #   create or replace function upsert_markets_bulk(j jsonb) returns int ...
    return await conn.fetchval("select upsert_markets_bulk($1::jsonb)", json.dumps(rows))

async def select_unknown_market_ids(conn: asyncpg.Connection, candidate_ids: List[str]) -> List[str]:
    if not candidate_ids:
        return []
    # Filter out null/blank and dedupe
    ids = [i for i in {x for x in candidate_ids if x}]
    # Ask DB which ones it doesn't know yet
    rows = await conn.fetch("select id from find_unknown_market_ids($1::text[])", ids)
    return [r["id"] for r in rows]

async def select_open_market_ids_needing_refresh(conn: asyncpg.Connection, stale_minutes: int = 60) -> List[str]:
    # Your DB function should return market_ids with status in ('open','pre') AND
    # (updated_at is null OR older than now - stale_minutes)
    rows = await conn.fetch("select market_id from pick_markets_needing_refresh($1)", stale_minutes)
    return [r["market_id"] for r in rows]

def normalize_market(m: Dict) -> Dict:
    market_id = _get(m, "id", "market_id", default="")
    status = (_get(m, "status", default="") or "").lower()
    title  = _get(m, "question", "title", default="")
    slug   = _get(m, "slug", default="")
    event  = _get(m, "event", default=None)

    # Build tokens list (never None)
    tokens: list[dict] = []
    toks = _get(m, "tokens") or _get(m, "outcomes") or []
    if isinstance(toks, list):
        for t in toks:
            tok_id = _get(t, "id", "token_id", default=None)
            label  = _get(t, "name", "label", "outcome", default=None)
            if tok_id:
                tokens.append({"token_id": tok_id, "label": label})

    resolved_at = _parse_iso_ts(_get(m, "resolvedAt", "resolutionTime", "resolved_at"))
    winner_token_id = _get(m, "winner", "winnerToken", "winner_token_id")

    created_at = _parse_iso_ts(_get(m, "createdAt", "created_at"))
    closes_at  = _parse_iso_ts(_get(m, "closesAt", "closeTime", "endTime", "end_time"))

    return {
        "market_id": market_id,
        "status": status,
        "title": title,
        "slug": slug,
        "event": event,
        "tokens": tokens,              # <-- always a list, not None
        "resolved_at": resolved_at,
        "winner_token_id": winner_token_id,
        "created_at": created_at,
        "closes_at": closes_at,
        "raw": m,
    }



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
    seen_market_ids: set[str] = set()

    for _ in range(5):
        page = await fetch_trades_page(addr, limit=page_limit, offset=offset, taker_only=False)
        if not page:
            break

        stop_idx = None
        for i, t in enumerate(page):
            t_ts_ms = _trade_ts_ms(t); t_id = _trade_id(t)
            if t_ts_ms is None or not t_id:
                continue
            # collect market ids as we go
            mid = t.get("conditionId") or t.get("market_id") or t.get("condition_id")
            if isinstance(mid, str) and mid:
                seen_market_ids.add(mid)

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

    # → Hydrate markets for any new market_ids discovered in this pass
    if seen_market_ids:
        # ask DB which are unknown
        unknown = await select_unknown_market_ids(conn, list(seen_market_ids))
        if unknown:
            await hydrate_markets_from_ids(conn, unknown)

    if newest_ts and newest_id:
        await set_watermark(conn, addr, newest_ts, newest_id)


async def hydrate_markets_from_ids(conn: asyncpg.Connection, market_ids: List[str]) -> int:
    if not market_ids:
        return 0
    markets = await fetch_markets_by_ids(market_ids)
    rows = [normalize_market(m) for m in markets]
    rows = [r for r in rows if r.get("market_id")]
    return await upsert_markets_bulk(conn, rows)

async def refresh_still_open_markets(conn: asyncpg.Connection, stale_minutes: int = 60) -> int:
    ids = await select_open_market_ids_needing_refresh(conn, stale_minutes=stale_minutes)
    return await hydrate_markets_from_ids(conn, ids)


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
            # Also opportunistically refresh still-open markets that are stale
            await refresh_still_open_markets(conn, stale_minutes=90)

        except Exception as e:
            await conn.execute(
                "select set_user_meta_synced($1,$2,$3,$4,$5,$6)",
                addr, dt.datetime.now(dt.timezone.utc), wm_ts, wm_id, "error", str(e)[:500]
            )
            raise
