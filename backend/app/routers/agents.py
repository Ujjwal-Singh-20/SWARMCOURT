"""
SwarmCourt API — Agent Endpoints
Fetch registered agents and their reputation from Solana.
"""

from fastapi import APIRouter, HTTPException
from app.models.schemas import AgentReputation, AgentListResponse

router = APIRouter()


def _get_client():
    from app.main import get_swarm_client
    return get_swarm_client()


@router.get("", response_model=AgentListResponse)
async def get_all_agents():
    """Fetch all registered agents with reputation scores from Solana."""
    client = _get_client()
    try:
        agents_raw = await client.get_global_agents()
        agents = []
        for a in agents_raw:
            accuracy = 0.0
            if a["total_cases"] > 0:
                accuracy = round((a["correct_votes"] / a["total_cases"]) * 100, 1)
            agents.append(AgentReputation(
                agent=a["agent"],
                score=a["score"],
                total_cases=a["total_cases"],
                correct_votes=a["correct_votes"],
                accuracy=accuracy,
                stake_slashed=a.get("stake_slashed", 0),
                vault_balance=a.get("vault_balance", 0),
            ))
        return AgentListResponse(agents=agents, total=len(agents))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch agents: {str(e)}")


@router.get("/{pubkey}", response_model=AgentReputation)
async def get_agent(pubkey: str):
    """Fetch reputation for a single agent by public key."""
    client = _get_client()
    try:
        agents_raw = await client.get_global_agents()
        for a in agents_raw:
            if a["agent"] == pubkey:
                accuracy = 0.0
                if a["total_cases"] > 0:
                    accuracy = round((a["correct_votes"] / a["total_cases"]) * 100, 1)
                return AgentReputation(
                    agent=a["agent"],
                    score=a["score"],
                    total_cases=a["total_cases"],
                    correct_votes=a["correct_votes"],
                    accuracy=accuracy,
                    stake_slashed=a.get("stake_slashed", 0),
                    vault_balance=a.get("vault_balance", 0),
                )
        raise HTTPException(status_code=404, detail=f"Agent {pubkey} not found")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch agent: {str(e)}")
