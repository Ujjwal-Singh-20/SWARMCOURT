"""
SwarmCourt Backend — FastAPI Application Entry Point

Provides REST + WebSocket API for the SwarmCourt multi-agent debate platform.
"""

import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Load environment variables
load_dotenv()

from app.core.solana_client import SwarmCourtClient
from app.routers.agents import router as agents_router
from app.routers.cases import router as cases_router
from app.routers.debate import router as debate_router


# ═══════════════════════════════════════════════════════════
# Shared state — initialized once at startup
# ═══════════════════════════════════════════════════════════

swarm_client: SwarmCourtClient | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize the SwarmCourt client on startup, cleanup on shutdown."""
    global swarm_client
    print("🚀 Initializing SwarmCourt Backend...")
    swarm_client = SwarmCourtClient()
    print("✅ SwarmCourt Backend Ready")
    yield
    # Cleanup
    if swarm_client and swarm_client._async_client:
        await swarm_client._async_client.close()
    print("🛑 SwarmCourt Backend Shutdown")


def get_swarm_client() -> SwarmCourtClient:
    """Dependency to get the shared SwarmCourt client."""
    if swarm_client is None:
        raise RuntimeError("SwarmCourt client not initialized")
    return swarm_client


# ═══════════════════════════════════════════════════════════
# FastAPI App
# ═══════════════════════════════════════════════════════════

app = FastAPI(
    title="SwarmCourt API",
    description="Decentralized Multi-Agent Debate & Reputation Protocol",
    version="1.0.0",
    lifespan=lifespan,
)

# ─── CORS ─────────────────────────────────────────────────
cors_origins_str = os.getenv("CORS_ORIGINS", "http://localhost:3000")
cors_origins = [origin.strip() for origin in cors_origins_str.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Routers ──────────────────────────────────────────────
app.include_router(agents_router, prefix="/agents", tags=["Agents"])
app.include_router(cases_router, prefix="/cases", tags=["Cases"])
app.include_router(debate_router, tags=["Debate"])


@app.get("/", tags=["Health"])
async def root():
    return {
        "service": "SwarmCourt API",
        "version": "1.0.0",
        "status": "operational",
        "program_id": os.getenv("PROGRAM_ID", "not_configured"),
    }


@app.get("/health", tags=["Health"])
async def health_check():
    client = get_swarm_client()
    return {
        "status": "healthy",
        "solana_connected": client._program is not None,
        "rpc_url": client.rpc_url,
    }
