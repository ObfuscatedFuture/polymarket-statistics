from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .db import init_pool
from .routes import snapshot_router

app = FastAPI(title="Polymarket Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000","http://127.0.0.1:3000","http://localhost:5173","http://127.0.0.1:5173"],
    allow_credentials=False,
    allow_methods=["GET","POST","OPTIONS"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup():
    await init_pool()

app.include_router(snapshot_router)
