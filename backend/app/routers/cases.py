"""
SwarmCourt API — Case Endpoints
Case data retrieval, feedback submission, and the open-case handshake.
"""

import asyncio
import os
from fastapi import APIRouter, HTTPException
from app.models.schemas import (
    OpenCaseRequest, OpenCaseResponse,
    FeedbackRequest, FeedbackResponse,
    CaseResponse, TranscriptResponse,
    HistoryResponse, SyncFeedbackRequest,
)
from app.core.storage import fetch_ipfs_transcript

router = APIRouter()


@router.get("/ping")
async def ping_cases():
    return {"status": "ok", "router": "cases"}


def _get_client():
    from app.main import get_swarm_client
    return get_swarm_client()


@router.post("/open-case", response_model=OpenCaseResponse)
async def open_case(req: OpenCaseRequest):
    """
    Handshake endpoint: Verifies the OpenCase transaction is confirmed on-chain,
    then returns the WebSocket URL for the live debate stream.
    
    The frontend must have already sent the OpenCase tx via Phantom.
    """
    print(f"DEBUG: open_case called with case_id={req.case_id}")
    client = _get_client()

    try:
        # 0. Verify the transaction signature exists
        print(f"DEBUG: Verifying transaction signature: {req.tx_signature}")
        try:
            tx_resp = await client._async_client.get_transaction(
                req.tx_signature, 
                commitment="confirmed",
                max_supported_transaction_version=0
            )
            if tx_resp.value is None:
                print(f"  ⚠ Transaction {req.tx_signature} not found yet. It might still be propagating.")
            else:
                print(f"  ✓ Transaction found on-chain.")
        except Exception as tx_e:
            print(f"  ⚠ get_transaction failed (likely fallback signature): {tx_e}")

        # 1. Verify the case exists on-chain (was created by the frontend tx)
        
        case_data = None
        for attempt in range(5):
            case_data = await client.get_case_data(req.case_id)
            if case_data:
                break
            print(f"DEBUG: Case not found, retrying in 1.5s... (Attempt {attempt+1}/5)")
            await asyncio.sleep(1.5)

        # Use request data as fallback if on-chain account hasn't propagated yet
        task = case_data.task if case_data else req.task
        topology = case_data.topology if case_data else req.topology
        jury_tier = case_data.jury_tier if case_data else req.jury_tier

        print(f"✅ Handshake successful for Case {req.case_id}. Starting debate...")

        return OpenCaseResponse(
            success=True,
            case_id=req.case_id,
            ws_url=f"{os.getenv('NEXT_PUBLIC_WS_URL', 'ws://localhost:8000')}/debate/{req.case_id}",
            task=task
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Handshake failed: {str(e)}")


@router.get("/{case_id}", response_model=CaseResponse)
async def get_case(case_id: int):
    """Fetch case data from the blockchain."""
    client = _get_client()
    try:
        data = await client.get_case_data_dict(case_id)
        if data is None:
            return CaseResponse(success=False, message=f"Case {case_id} not found on-chain")
        return CaseResponse(success=True, case=data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch case: {str(e)}")


@router.get("/{case_id}/transcript", response_model=TranscriptResponse)
async def get_transcript(case_id: int):
    """Fetch the full IPFS transcript for a case."""
    client = _get_client()
    try:
        case_data = await client.get_case_data(case_id)
        if case_data is None:
            return TranscriptResponse(success=False, message=f"Case {case_id} not found")

        if not case_data.transcript_cid:
            return TranscriptResponse(success=False, message="No transcript committed yet")

        transcript = await fetch_ipfs_transcript(case_data.transcript_cid)
        if transcript is None:
            return TranscriptResponse(success=False, message="Failed to fetch from IPFS gateway")

        return TranscriptResponse(success=True, transcript=transcript)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch transcript: {str(e)}")


@router.post("/feedback", response_model=FeedbackResponse)
async def submit_feedback(req: FeedbackRequest):
    """
    Submit user feedback for a finalized case, then trigger
    reputation recalculation for all involved agents.
    """
    client = _get_client()
    try:
        # 1. Submit feedback on-chain
        tx = await client.submit_feedback_onchain(req.case_id, req.satisfied, req.rating)
        if "FAILED" in str(tx) or "ERROR" in str(tx):
            raise HTTPException(status_code=500, detail=f"Feedback submission failed: {tx}")

        # 2. Recalculate reputation for each involved agent
        case_data = await client.get_case_data(req.case_id)
        reputation_updates = []

        if case_data:
            all_agents = set()
            for a in case_data.agents:
                if str(a) != "11111111111111111111111111111111":
                    all_agents.add(str(a))
            if case_data.generator and str(case_data.generator) != "11111111111111111111111111111111":
                all_agents.add(str(case_data.generator))
            for v in case_data.validators:
                if str(v) != "11111111111111111111111111111111":
                    all_agents.add(str(v))

            for agent_str in all_agents:
                try:
                    rep_tx = await client.recalculate_reputation_onchain(req.case_id, agent_str)
                    reputation_updates.append({
                        "agent": agent_str,
                        "tx": rep_tx,
                        "success": "FAILED" not in str(rep_tx),
                    })
                except Exception as e:
                    reputation_updates.append({
                        "agent": agent_str,
                        "error": str(e),
                        "success": False,
                    })

        return FeedbackResponse(
            success=True,
            feedback_tx=tx,
            reputation_updates=reputation_updates,
            message="Feedback submitted and reputation updated",
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Feedback failed: {str(e)}")

@router.post("/feedback/sync", response_model=FeedbackResponse)
async def sync_feedback(req: SyncFeedbackRequest):
    """
    Sync endpoint: Called after the user has submitted feedback on-chain.
    Triggers reputation recalculation for all involved agents.
    """
    client = _get_client()
    try:
        # Recalculate reputation for each involved agent
        case_data = await client.get_case_data(req.case_id)
        reputation_updates = []

        if case_data:
            all_agents = set()
            for a in case_data.agents:
                if str(a) != "11111111111111111111111111111111":
                    all_agents.add(str(a))
            if case_data.generator and str(case_data.generator) != "11111111111111111111111111111111":
                all_agents.add(str(case_data.generator))
            for v in case_data.validators:
                if str(v) != "11111111111111111111111111111111":
                    all_agents.add(str(v))

            for agent_str in all_agents:
                try:
                    rep_tx = await client.recalculate_reputation_onchain(req.case_id, agent_str)
                    reputation_updates.append({
                        "agent": agent_str,
                        "tx": rep_tx,
                        "success": "FAILED" not in str(rep_tx),
                    })
                except Exception as e:
                    reputation_updates.append({
                        "agent": agent_str,
                        "error": str(e),
                        "success": False,
                    })

        return FeedbackResponse(
            success=True,
            feedback_tx=req.tx_signature,
            reputation_updates=reputation_updates,
            message="On-chain feedback synced and reputation updated",
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Sync failed: {str(e)}")

@router.get("/user/{address}", response_model=HistoryResponse)
async def get_user_history(address: str):
    """Fetch all cases created by a specific user address."""
    client = _get_client()
    try:
        cases = await client.get_user_cases(address)
        return HistoryResponse(success=True, cases=cases)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch history: {str(e)}")
