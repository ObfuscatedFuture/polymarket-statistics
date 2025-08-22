# src/backend/app/routes/snapshot.py
from fastapi import APIRouter, BackgroundTasks, Query
import datetime as dt
from typing import Optional
from ..db import acquire
from ..sync import head_check_and_maybe_refresh

router = APIRouter()

def _aware(ts: Optional[dt.datetime]) -> Optional[dt.datetime]:
    if ts is None: return None
    return ts if ts.tzinfo else ts.replace(tzinfo=dt.timezone.utc)

def due_policy(now: dt.datetime, meta: Optional[dict]) -> bool:
    if not meta: return True
    lv, ls = _aware(meta.get("last_viewed_at")), _aware(meta.get("last_synced_at"))
    if not lv or not ls: return True
    age = (now - ls).total_seconds()
    recent_view = (now - lv).total_seconds()
    if recent_view <= 24*3600: return age > 15*60
    if recent_view <= 7*24*3600: return age > 6*3600
    return True

@router.get("/api/users/{addr}/snapshot")
async def snapshot(addr: str, bg: BackgroundTasks,
                   limit: int = Query(1000, ge=1, le=5000),
                   offset: int = Query(0, ge=0)):
    addr = addr.strip().lower()
    now = dt.datetime.now(dt.timezone.utc)

    async with acquire() as conn:
        trades = await conn.fetch(
            """
            select trade_id, traded_at, token_id, side, price, size, quote
            from trades
            where user_address=$1
            order by traded_at desc
            limit $2 offset $3
            """, addr, limit, offset
        )
        # positions_cache has payload jsonb + fetched_at
        pos_row = await conn.fetchrow(
            """select payload, fetched_at
               from positions_cache
               where user_address=$1
               order by fetched_at desc
               limit 1""", addr
        )
        positions = {"data": pos_row["payload"], "fetched_at": pos_row["fetched_at"]} if pos_row else None

        # value_cache has portfolio_value, currency, fetched_at
        val_row = await conn.fetchrow(
            """select portfolio_value, currency, fetched_at
               from value_cache
               where user_address=$1
               order by fetched_at desc
               limit 1""", addr
        )
        value = dict(val_row) if val_row else None

        meta_row = await conn.fetchrow(
            """select user_address, sync_status, last_viewed_at, last_synced_at,
                      last_trade_at_cached, last_trade_id_cached, error_msg
               from user_sync_meta
               where user_address=$1""", addr
        )

        # inline touch_user_last_viewed
        await conn.execute(
            """insert into user_sync_meta (user_address, last_viewed_at)
               values ($1, now())
               on conflict (user_address) do update set last_viewed_at=excluded.last_viewed_at""",
            addr
        )

    meta = dict(meta_row) if meta_row else None
    should_queue = (
        (len(trades) == 0 and positions is None and value is None) or
        due_policy(now, meta)
    ) and (not meta or meta.get("sync_status") != "running")

    if should_queue:
        bg.add_task(head_check_and_maybe_refresh, addr)
        if not meta: meta = {"user_address": addr}
        meta["sync_status"] = meta.get("sync_status") or "running"

    return {
        "trades": [dict(r) for r in trades],
        "positions": positions,
        "value": value,
        "meta": meta,
    }
