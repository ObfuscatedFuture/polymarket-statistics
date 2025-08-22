# app/jobs/overlap_repair.py
async def overlap_repair_for(addr: str, overlap_pages: int = 2, page_size: int = 100):
    pool: asyncpg.Pool = ...
    async with pool.acquire() as conn:
        # Start at head and fetch a couple of pages
        offset = 0
        collected = []
        for _ in range(overlap_pages):
            page = await fetch_trades_page(addr, limit=page_size, offset=offset, taker_only=False)
            if not page: break
            collected.extend(page)
            offset += page_size

        if collected:
            await upsert_trades_bulk(conn, [normalize_trade(t) for t in collected])
            # Do not move watermark; this is just to fill gaps
