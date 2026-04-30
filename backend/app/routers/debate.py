"""
SwarmCourt API — Debate WebSocket Endpoint
Live-streams agent utterances to the frontend during a debate.
"""

import json
import time
import asyncio

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.core.solana_client import DebateConfig

router = APIRouter()


def _get_client():
    from app.main import get_swarm_client
    return get_swarm_client()


# Global registry for connected agent nodes: {agent_pubkey: WebSocket}
agent_connections = {}
pending_responses = {}  # {agent_pubkey: asyncio.Future}
active_debates = set()  # {case_id}


@router.websocket("/debate/{case_id}")
async def debate_websocket(websocket: WebSocket, case_id: int):
    """
    WebSocket endpoint for live debate streaming.
    """
    await websocket.accept()
    
    if case_id in active_debates:
        await websocket.send_json({"type": "error", "content": "Debate orchestration is already running for this case."})
        await websocket.close()
        return
        
    active_debates.add(case_id)
    client = _get_client()

    try:
        # 1. Receive debate config from the frontend
        config_data = await asyncio.wait_for(websocket.receive_json(), timeout=30)
        
        task = config_data.get("task", "")
        topology = config_data.get("topology", 0)
        option_a = config_data.get("option_a", "Option A")
        option_b = config_data.get("option_b", "Option B")
        model = config_data.get("model", "groq:llama-3.1-8b-instant")

        # 2. Verify case exists on-chain
        await websocket.send_json({"type": "status", "content": "Verifying case on-chain..."})
        
        case_data = await client.get_case_data(case_id)
        if case_data is None:
            await websocket.send_json({"type": "error", "content": f"Case {case_id} not found on-chain."})
            await websocket.close()
            return

        if case_data.state != 0:
            await websocket.send_json({"type": "error", "content": f"Case is in state {case_data.state}, expected 0."})
            await websocket.close()
            return

        # 3. Pre-debate Connection Sync (Drafted Agents check)
        await websocket.send_json({"type": "status", "content": "Verifying agent connectivity..."})
        
        MAX_SYNC_ATTEMPTS = 5
        for sync_attempt in range(MAX_SYNC_ATTEMPTS):
            case_data = await client.get_case_data(case_id)
            if not case_data: break
            
            agents = [str(a) for a in case_data.agents]
            missing_agents = [a for a in agents if a not in agent_connections]
            
            if not missing_agents:
                await websocket.send_json({"type": "status", "content": "All agents synchronized and online."})
                break
                
            await websocket.send_json({
                "type": "status", 
                "content": f"Sync Attempt {sync_attempt + 1}: Agent(s) {len(missing_agents)} offline. Triggering autonomous redraft...",
                "data": {"missing": missing_agents}
            })
            
            # Attempt to redraft the first missing agent
            try:
                target = missing_agents[0]
                redraft_tx = await client.penalize_and_redraft_onchain(case_id, target)
                if "FAILED" in str(redraft_tx):
                     print(f"❌ Redraft instruction failed: {redraft_tx}")
                     # Wait a bit and try again (maybe same agent was drafted)
                     await asyncio.sleep(5)
                else:
                    await websocket.send_json({"type": "status", "content": f"Redraft successful. Tx: {str(redraft_tx)[:16]}..."})
                    # Delay for RPC propagation and state update
                    await asyncio.sleep(6)
            except Exception as e:
                print(f"Sync redraft exception: {e}")
                await asyncio.sleep(2)

        # Refresh agents list after sync
        case_data = await client.get_case_data(case_id)
        agents = [str(a) for a in case_data.agents]
        
        # FINAL CHECK: If still missing agents, check if ANY are connected
        if any(a not in agent_connections for a in agents):
            if not agent_connections:
                await websocket.send_json({"type": "error", "content": "CRITICAL: No AI agents are currently connected to the Hub. Please launch your agent nodes."})
                await websocket.close()
                return
            await websocket.send_json({"type": "status", "content": "Warning: Some agents remain offline after redrafting. Protocol will use fallbacks."})

        models = {a: model for a in agents}

        await websocket.send_json({
            "type": "status",
            "content": f"Debate starting with {len(agents)} agents...",
            "data": {"agents": agents, "topology": topology, "case_id": case_id},
        })

        # 4. Build config and run the streaming debate
        config = DebateConfig(
            case_id=case_id,
            task=case_data.task,
            option_a=option_a,
            option_b=option_b,
            agents=agents,
            models=models,
            model=model,
            rounds=2,
            topology=case_data.topology,
        )
        full_transcript = None
        utterance = None

        # Manual iteration to support asend() for injecting agent responses
        gen = client.run_debate_streaming(config)
        try:
            msg = await gen.__anext__()
            while True:
                # 4.1 Handle request for utterance from external agent
                if msg.get("type") == "request_utterance":
                    agent_pk = msg.get("agent")
                    await websocket.send_json({"type": "status", "agent": agent_pk, "content": f"Waiting for {agent_pk[:8]}... to speak", "role": msg.get("role")})
                    
                    utterance = "Agent failed to respond."
                    if agent_pk in agent_connections:
                        agent_ws = agent_connections[agent_pk]
                        try:
                            future = asyncio.get_event_loop().create_future()
                            pending_responses[agent_pk] = future
                            await agent_ws.send_json(msg)
                            resp = await asyncio.wait_for(future, timeout=45) # 45s timeout for live agents
                            utterance = resp.get("content", "Agent provided empty response.")
                        except asyncio.TimeoutError:
                            print(f"⏰ Agent {agent_pk} timed out! Triggering on-chain redraft...")
                            await websocket.send_json({"type": "status", "content": f"Agent {agent_pk[:8]} timed out. Penalizing and redrafting..."})
                            
                            try:
                                # Trigger on-chain penalty and redraft
                                redraft_tx = await client.penalize_and_redraft_onchain(case_id, agent_pk)
                                await websocket.send_json({"type": "status", "content": f"New agent drafted! Tx: {redraft_tx}"})
                                utterance = f"Protocol Notice: Agent {agent_pk[:8]} was penalized for inactivity. Replacement drafted."
                            except Exception as redraft_e:
                                print(f"❌ Redraft failed: {redraft_e}")
                                utterance = "Agent failed to respond, and redraft failed."
                        except Exception as e:
                            print(f"Error communicating with agent {agent_pk}: {e}")
                        finally:
                            pending_responses.pop(agent_pk, None)
                    else:
                        # Agent dropped off between sync and round or redraft failed
                        await asyncio.sleep(2)
                        utterance = f"Node {agent_pk[:8]} is currently desynchronized. Proceeding with protocol fallback."

                    # Send the response BACK into the generator
                    msg = await gen.asend(utterance)
                    continue

                # Stream each message to the frontend
                await websocket.send_json(msg)

                # Capture the final transcript
                if msg.get("type") == "complete" and msg.get("data"):
                    full_transcript = msg["data"].get("transcript")
                
                # Advance to next message
                msg = await gen.__anext__()

        except StopAsyncIteration:
            pass
        except Exception as e:
            print(f"Debate Generator Error: {e}")
            await websocket.send_json({"type": "error", "content": str(e)})

        if not full_transcript:
            await websocket.send_json({"type": "error", "content": "Debate produced no transcript."})
            await websocket.close()
            return

        # 4. Commit transcript to IPFS
        await websocket.send_json({"type": "status", "content": "Uploading transcript to IPFS..."})
        full_transcript["case_id"] = case_id
        ipfs_cid, is_real = client.commit_transcript(full_transcript)

        storage_type = "IPFS" if is_real else "SHA-256 fallback"
        await websocket.send_json({
            "type": "status",
            "content": f"Transcript committed to {storage_type}: {ipfs_cid[:20]}...",
            "data": {"cid": ipfs_cid, "is_ipfs": is_real},
        })

        # 5. Ask Frontend to commit transcript hash on-chain (Hub cannot sign for non-admin creators)
        await websocket.send_json({
            "type": "request_onchain_commit",
            "content": "Debate complete! Please sign to commit transcript on-chain.",
            "data": {"cid": ipfs_cid}
        })
        
        # Wait for frontend to confirm commit
        try:
            conf = await asyncio.wait_for(websocket.receive_json(), timeout=60)
            if conf.get("type") != "onchain_commit_success":
                raise Exception("Frontend failed to commit transcript")
        except asyncio.TimeoutError:
            raise Exception("Timed out waiting for frontend on-chain commit")

        # 6. Wait for autonomous agent votes
        expected_votes = len(agents) if topology == 0 else len(agents) - 1
        await websocket.send_json({
            "type": "status",
            "content": f"Waiting for {expected_votes} agent votes on-chain...",
            "data": {"expected_votes": expected_votes},
        })

        votes_found = 0
        for attempt in range(24):  # ~2 minute timeout
            case_check = await client.get_case_data(case_id)
            if case_check:
                votes_found = len(case_check.votes)
                await websocket.send_json({
                    "type": "vote_status",
                    "content": f"Votes: {votes_found}/{expected_votes}",
                    "data": {"votes_found": votes_found, "expected": expected_votes},
                })
                if votes_found >= expected_votes:
                    break
            await asyncio.sleep(5)

        # 7. Ask Frontend to finalize case on-chain
        await websocket.send_json({
            "type": "request_onchain_finalize",
            "content": "Votes are in! Please sign to finalize the case.",
            "data": {"winner": winner[0] if 'winner' in locals() else 0}
        })

        # Wait for frontend to confirm finalization
        try:
            conf = await asyncio.wait_for(websocket.receive_json(), timeout=60)
            if conf.get("type") != "onchain_finalize_success":
                raise Exception("Frontend failed to finalize case")
            tx = conf.get("data", {}).get("tx", "Success")
        except asyncio.TimeoutError:
            raise Exception("Timed out waiting for frontend on-chain finalize")

        if "FAILED" in str(tx) or "ERROR" in str(tx):
            await websocket.send_json({
                "type": "error",
                "content": f"Finalization failed: {tx}",
            })
        else:
            # Determine winner from transcript votes
            from collections import Counter
            vote_vals = list(full_transcript["votes"].values())
            vote_counts = Counter(vote_vals)
            winner = vote_counts.most_common(1)[0] if vote_counts else (0, 0)

            await websocket.send_json({
                "type": "finalized",
                "content": f"Case finalized! Winner: Option {winner[0]} ({winner[1]}/{len(vote_vals)} votes)",
                "data": {
                    "winner": winner[0],
                    "votes": dict(vote_counts),
                    "tx": str(tx)[:64],
                    "transcript_cid": ipfs_cid,
                    "final_output": full_transcript.get("final_output", ""),
                },
            })

        await websocket.send_json({"type": "done", "content": "Session complete."})

    except WebSocketDisconnect:
        print(f"WebSocket disconnected for case {case_id}")
    except asyncio.TimeoutError:
        await websocket.send_json({"type": "error", "content": "Connection timeout — no config received."})
        await websocket.close()
    except Exception as e:
        try:
            await websocket.send_json({"type": "error", "content": f"Server error: {str(e)}"})
        except Exception:
            pass
        print(f"Debate WebSocket error for case {case_id}: {e}")
    finally:
        active_debates.discard(case_id)

@router.websocket("/agent-connect/{agent_pubkey}")
async def agent_websocket(websocket: WebSocket, agent_pubkey: str):
    """WebSocket endpoint for autonomous agents to register with the Hub."""
    await websocket.accept()
    agent_connections[agent_pubkey] = websocket
    print(f"🤖 Agent Connected: {agent_pubkey}")
    try:
        while True:
            # Route messages back to the debate orchestrator
            try:
                data = await websocket.receive_json()
                if agent_pubkey in pending_responses:
                    if not pending_responses[agent_pubkey].done():
                        pending_responses[agent_pubkey].set_result(data)
            except WebSocketDisconnect:
                break
            except RuntimeError as e:
                if "disconnect" in str(e).lower():
                    break
                print(f"Agent websocket error: {e}")
            except Exception as e:
                print(f"Agent websocket error parsing JSON: {e}")
    except WebSocketDisconnect:
        if agent_connections.get(agent_pubkey) == websocket:
            del agent_connections[agent_pubkey]
        print(f"🤖 Agent Disconnected: {agent_pubkey}")
