"""
SwarmCourt Client — Ported from OLD/client/swarmcourt/client.py for FastAPI backend.
Handles: debate orchestration, on-chain Solana interaction, IPFS storage.
"""

import json
import time
import hashlib
import os
import re
import asyncio
from dataclasses import dataclass, field
from typing import Optional, AsyncGenerator
from pathlib import Path

from .storage import upload_to_ipfs

try:
    from google import genai
    from solders.keypair import Keypair
    from solders.pubkey import Pubkey
    from solana.rpc.api import Client
    from solana.rpc.async_api import AsyncClient
    from anchorpy import Program, Provider, Wallet, Context, Idl
except ImportError:
    pass


@dataclass
class DebateConfig:
    """Configuration for a SwarmCourt debate."""
    case_id: int = 0
    task: str = "Which code snippet is higher quality?"
    option_a: str = "Option A"
    option_b: str = "Option B"
    agents: list[str] = field(default_factory=lambda: ["Agent_Alpha", "Agent_Beta", "Agent_Gamma"])
    models: dict = field(default_factory=dict)
    model: str = "groq:llama-3.1-8b-instant"
    rounds: int = 2
    topology: int = 0
    jury_tier: int = 0


class SwarmCourtClient:
    """
    SwarmCourt backend client — orchestrates AI debates and manages on-chain state.
    Always runs in real mode (no mock).
    """

    def __init__(self):
        from dotenv import load_dotenv
        load_dotenv()

        self.program_id = os.getenv("PROGRAM_ID")
        self.rpc_url = os.getenv("SOLANA_RPC_URL", "https://api.devnet.solana.com")
        self.admin_wallet = os.getenv("ADMIN_WALLET_ADDRESS")

        raw_jwt = os.getenv("PINATA_JWT")
        self._pinata_jwt = raw_jwt.strip().strip('"').strip("'") if raw_jwt else None

        self._async_client = None
        self._program = None
        self._keypair = None
        self._wallet = None
        self._provider = None
        
        self._setup_solana()

    # ═══════════════════════════════════════════════════════════
    # SOLANA SETUP
    # ═══════════════════════════════════════════════════════════

    def _setup_solana(self):
        """Initialize real Solana connection using anchorpy."""
        try:
            secret_key = os.getenv("ORCHESTRATOR_SECRET_KEY")
            if secret_key:
                import base58
                key_bytes = base58.b58decode(secret_key)
                self._keypair = Keypair.from_bytes(key_bytes)
                print(f"✓ Wallet Loaded from ORCHESTRATOR_SECRET_KEY")
            else:
                self._setup_keypair_from_file()

            self._async_client = AsyncClient(self.rpc_url)
            self._wallet = Wallet(self._keypair)
            self._provider = Provider(self._async_client, self._wallet)

            # Load IDL
            possible_idl_paths = [
                os.path.join(os.path.dirname(__file__), "..", "..", "swarmcourt_idl.json"),
                os.path.join(os.path.dirname(__file__), "swarmcourt_idl.json"),
                os.path.join(os.getcwd(), "swarmcourt_idl.json"),
            ]

            idl_path = None
            for p in possible_idl_paths:
                if p and os.path.exists(p):
                    idl_path = p
                    break

            if idl_path:
                with open(idl_path) as f:
                    idl_string = f.read()
                self._idl = Idl.from_json(idl_string)
                self._program = Program(self._idl, Pubkey.from_string(self.program_id), self._provider)
                print(f"✓ SwarmCourt Program initialized: {self.program_id}")
            else:
                print(f"⚠ IDL not found at any expected location.")

            print(f"✓ Solana client connected to {self.rpc_url}")
            print(f"  Wallet: {self._keypair.pubkey()}")

        except ImportError:
            print("⚠ anchorpy/solana dependencies not installed.")


    def _setup_keypair_from_file(self):
        kp_path = os.getenv("ORCHESTRATOR_KEYPAIR_PATH", os.path.expanduser("~/.config/solana/id.json"))
        kp_full_path = os.path.expanduser(kp_path)
        if not os.path.exists(kp_full_path):
            self._keypair = Keypair()
        else:
            with open(kp_full_path, "r") as f:
                secret = json.load(f)
            self._keypair = Keypair.from_bytes(bytes(secret))

    def _run_async(self, coro):
        """Helper to run a coroutine in the persistent event loop."""
        try:
            loop = asyncio.get_event_loop()
            if loop.is_closed():
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
        return loop.run_until_complete(coro)

    # ═══════════════════════════════════════════════════════════
    # ON-CHAIN READ OPERATIONS
    # ═══════════════════════════════════════════════════════════

    async def get_global_agents(self) -> list[dict]:
        """Fetch all registered agents and their reputation scores from Solana."""
        results = []
        try:
            global_state_pda, _ = Pubkey.find_program_address([b"global"], self._program.program_id)
            try:
                state = await self._program.account["GlobalState"].fetch(global_state_pda)
                if state.agents:
                    for agent_pubkey in state.agents:
                        try:
                            rep_pda, _ = Pubkey.find_program_address(
                                [b"reputation", bytes(agent_pubkey)], self._program.program_id
                            )
                            rep = await self._program.account["AgentReputation"].fetch(rep_pda)

                            # Get vault balance
                            balance_resp = await self._async_client.get_balance(rep_pda)
                            vault_balance = balance_resp.value / 1_000_000_000

                            results.append({
                                "agent": str(agent_pubkey),
                                "score": rep.score,
                                "total_cases": rep.total_cases,
                                "correct_votes": rep.correct_votes,
                                "stake_slashed": rep.stake_slashed / 1_000_000_000,
                                "vault_balance": vault_balance,
                            })
                        except Exception as e:
                            print(f"  ⚠ Failed to fetch rep for {agent_pubkey}: {e}")
                    return results
            except Exception:
                pass

            # Fallback: fetch ALL AgentReputation accounts
            reps = await self._program.account["AgentReputation"].all()
            for r in reps:
                # Calculate accuracy safely
                accuracy = 0.0
                if r.account.total_cases > 0:
                    accuracy = (r.account.correct_votes / r.account.total_cases) * 100.0

                results.append({
                    "agent": str(r.account.agent),
                    "score": r.account.score,
                    "total_cases": r.account.total_cases,
                    "correct_votes": r.account.correct_votes,
                    "accuracy": accuracy,
                    "stake_slashed": r.account.stake_slashed / 1_000_000_000,
                    "vault_balance": 0.0,
                })
        except Exception as e:
            print(f"On-chain fetch failed: {e}")
        return results

    async def get_case_data(self, case_id: int):
        """Fetch Case account data from Solana with global search fallback."""
        try:
            seed_bytes = case_id.to_bytes(8, "little")
            case_pda, _ = Pubkey.find_program_address(
                [b"case", seed_bytes], self._program.program_id
            )
            print(f"DEBUG: Attempting direct fetch at {case_pda}")
            return await self._program.account["Case"].fetch(case_pda)
        except Exception:
            print(f"  ⚠ Direct fetch failed. Falling back to global search for case_id={case_id}...")
            try:
                # Fallback: Fetch ALL Case accounts and filter by the internal case_id field
                all_accounts = await self._program.account["Case"].all()
                for acc in all_accounts:
                    if acc.account.case_id == case_id:
                        print(f"  ✅ Found case {case_id} via global search at {acc.public_key}")
                        return acc.account
                print(f"  ❌ Case {case_id} not found in any on-chain account.")
                return None
            except Exception as e:
                print(f"  ❌ Global search failed: {e}")
                return None

    async def get_case_data_dict(self, case_id: int) -> dict | None:
        """Fetch case data as a serializable dict."""
        data = await self.get_case_data(case_id)
        if not data:
            return None
        return {
            "case_id": data.case_id,
            "creator": str(data.creator),
            "task": data.task,
            "state": data.state,
            "topology": data.topology,
            "jury_tier": data.jury_tier,
            "generator": str(data.generator) if data.generator else None,
            "validators": [str(v) for v in data.validators],
            "agents": [str(a) for a in data.agents],
            "transcript_cid": data.transcript_cid,
            "votes": [{"agent": str(v.agent), "choice": v.choice} for v in data.votes],
            "final_choice": data.final_choice,
            "has_final": data.has_final,
            "has_feedback": data.has_feedback,
            "user_satisfied": data.user_satisfied,
            "user_rating": data.user_rating,
            "bounty": data.bounty / 1_000_000_000,
            "created_at": data.created_at,
        }

    async def get_user_cases(self, user_pubkey_str: str) -> list[dict]:
        """Fetch all cases created by a specific user address."""
        results = []
        try:
            # Fetch ALL cases and filter manually in Python (Bulletproof)
            # This avoids memcmp offset issues and ensures we match the CLI
            all_cases = await self._program.account["Case"].all()
            
            for c in all_cases:
                if str(c.account.creator) == user_pubkey_str:
                    results.append({
                        "id": str(c.account.case_id),
                        "task": c.account.task,
                        "state": c.account.state,
                        "topology": c.account.topology,
                        "has_feedback": c.account.has_feedback,
                        "bounty": c.account.bounty / 1_000_000_000,
                        "date": c.account.created_at,
                    })
            
            # Sort by ID descending (newest first)
            results.sort(key=lambda x: int(x["id"]), reverse=True)
            print(f"✅ Found {len(results)} cases for {user_pubkey_str}")
        except Exception as e:
            print(f"❌ Failed to fetch user cases: {e}")
        return results

    # ═══════════════════════════════════════════════════════════
    # ═══════════════════════════════════════════════════════════
    # ON-CHAIN WRITE OPERATIONS
    # ═══════════════════════════════════════════════════════════

    async def _call_instruction(self, name: str, args: list, agent_context: str = None) -> str:
        """Call an on-chain instruction using positional arguments."""
        if not self._program:
            return "ERROR_NO_PROGRAM"

        try:
            method = None
            snake_name = re.sub(r'([A-Z])', r'_\1', name).lower().lstrip('_')
            patterns = [snake_name, name, name.lower()]

            for p in patterns:
                try:
                    method = self._program.rpc[p]
                    if method:
                        break
                except (KeyError, AttributeError):
                    continue

            if not method:
                for p in patterns:
                    if hasattr(self._program.rpc, p):
                        method = getattr(self._program.rpc, p)
                        break

            if not method:
                return f"ERROR_METHOD_NOT_FOUND_{name}"

            ctx_args = {"agent": agent_context} if agent_context else {}
            if args and isinstance(args[0], int):
                ctx_args["case_id"] = args[0]

            ctx = self._get_context_for_instruction(name, ctx_args)
            signature = await method(*args, ctx=ctx)
            print(f"  ✓ Transaction Confirmed: {str(signature)[:32]}...")
            return str(signature)
        except Exception as e:
            msg = str(e)
            print(f"  ❌ On-chain Error: {msg}")
            if "already in use" in msg.lower():
                return "ERROR_ACCOUNT_ALREADY_IN_USE"
            return f"FAILED: {msg}"

    async def initialize_case_onchain(self, case_id: int, task: str, topology: int, bounty_sol: float) -> str:
        """[ADMIN/ORCHESTRATOR] Draft a new case on-chain."""
        bounty_lamports = int(bounty_sol * 1_000_000_000)
        return await self._call_instruction("initializeCase", [case_id, task, topology, bounty_lamports])

    async def commit_transcript_onchain(self, case_id: int, transcript_cid: str) -> str:
        """[ADMIN/ORCHESTRATOR] Commit the IPFS CID for a case."""
        return await self._call_instruction("commitTranscript", [case_id, transcript_cid])

    async def cast_vote_onchain(self, case_id: int, choice: int, agent_pubkey_str: str) -> str:
        """[AGENT] Cast an autonomous vote using the agent's private key."""
        return await self._call_instruction("submitVote", [case_id, choice], agent_context=agent_pubkey_str)

    async def penalize_and_redraft_onchain(self, case_id: int, penalized_agent_pubkey: str):
        """Trigger on-chain penalty and redrafting for an unresponsive agent."""
        return await self._call_instruction(
            "penalize_and_redraft",
            [case_id, Pubkey.from_string(penalized_agent_pubkey)],
            agent_context=penalized_agent_pubkey
        )

    async def finalize_case_onchain(self, case_id: int) -> str:
        """[ADMIN/ORCHESTRATOR] Finalize a case on-chain."""
        return await self._call_instruction("finalizeCase", [case_id])

    async def submit_feedback_onchain(self, case_id: int, satisfied: bool, rating: int = None) -> str:
        """[CREATOR] Submit feedback on-chain."""
        return await self._call_instruction("submitFeedback", [case_id, satisfied, rating or 0])

    async def recalculate_reputation_onchain(self, case_id: int, agent_pubkey_str: str) -> str:
        """[ADMIN/ORCHESTRATOR] Trigger reputation update for an agent."""
        return await self._call_instruction("recalculateReputation", [case_id], agent_context=agent_pubkey_str)

    def _get_context_for_instruction(self, name: str, args: dict):
        """Calculate accounts and return Context for anchorpy instructions."""
        accounts = {}

        def add_acc(key: str, val):
            camel = key[0].lower() + key[1:] if len(key) > 0 else key
            accounts[camel] = val
            snake = re.sub(r'([A-Z])', r'_\1', key).lower().lstrip('_')
            accounts[snake] = val

        sys_prog = Pubkey.from_string("11111111111111111111111111111111")
        add_acc("systemProgram", sys_prog)

        global_state, _ = Pubkey.find_program_address([b"global"], self._program.program_id)
        add_acc("globalState", global_state)

        if name in ["initializeGlobal", "initialize_global"]:
            add_acc("admin", self._wallet.public_key)

        elif name in ["registerAgent", "register_agent", "unregisterAgent", "unregister_agent"]:
            agent_str = args.get("agent")
            agent_pubkey = Pubkey.from_string(str(agent_str)) if agent_str else self._wallet.public_key
            reputation, _ = Pubkey.find_program_address([b"reputation", bytes(agent_pubkey)], self._program.program_id)
            add_acc("reputation", reputation)
            add_acc("agent", agent_pubkey)
            if "register" in name.lower() and "un" not in name.lower():
                add_acc("payer", self._wallet.public_key)
            if "unregister" in name.lower():
                add_acc("owner", self._wallet.public_key)

        elif name in ["openCase", "open_case", "commitTranscript", "commit_transcript",
                       "submitVote", "submit_vote", "finalizeCase", "finalize_case",
                       "submitFeedback", "submit_feedback"]:
            case_id = args.get("case_id") or args.get("caseId")
            case_pda, _ = Pubkey.find_program_address([b"case", case_id.to_bytes(8, "little")], self._program.program_id)
            add_acc("case", case_pda)

            if name in ["openCase", "open_case"]:
                admin_wallet_pk = Pubkey.from_string(self.admin_wallet) if self.admin_wallet else self._wallet.public_key
                add_acc("adminWallet", admin_wallet_pk)
                add_acc("creator", self._wallet.public_key)
            elif name in ["commitTranscript", "commit_transcript", "finalizeCase", "finalize_case",
                          "submitFeedback", "submit_feedback"]:
                add_acc("creator", self._wallet.public_key)
            if name in ["submitVote", "submit_vote"]:
                agent_str = args.get("agent")
                agent_pubkey = Pubkey.from_string(str(agent_str)) if agent_str else self._wallet.public_key
                add_acc("agent", agent_pubkey)

        if name in ["recalculateReputation", "recalculate_reputation", "penalizeAndRedraft", "penalize_and_redraft"]:
            case_id = args.get("case_id") or args.get("caseId")
            agent_arg = args.get("agent_pubkey") or args.get("agent") or args.get("penalized_agent") or args.get("penalizedAgent")
            case_pda, _ = Pubkey.find_program_address([b"case", case_id.to_bytes(8, "little")], self._program.program_id)
            agent_pubkey = Pubkey.from_string(str(agent_arg)) if agent_arg else self._wallet.public_key
            reputation, _ = Pubkey.find_program_address([b"reputation", bytes(agent_pubkey)], self._program.program_id)
            add_acc("case", case_pda)
            add_acc("reputation", reputation)
            add_acc("globalState", global_state)
            if "penalize" in name.lower():
                add_acc("caller", self._wallet.public_key)
                add_acc("penalizedAgent", agent_pubkey)

        # In decentralized mode, signers must be provided by external agent nodes
        signers = []

        return Context(accounts=accounts, signers=signers)

    def commit_transcript_onchain(self, case_id: int, ipfs_cid: str) -> str:
        return self._call_instruction("commitTranscript", [case_id, ipfs_cid])

    def finalize_case_onchain(self, case_id: int) -> str:
        return self._call_instruction("finalizeCase", [case_id])

    def submit_feedback_onchain(self, case_id: int, satisfied: bool, rating: int = None) -> str:
        return self._call_instruction("submitFeedback", [case_id, satisfied, rating])

    def recalculate_reputation_onchain(self, case_id: int, agent_pk_str: str) -> str:
        agent_pk = Pubkey.from_string(agent_pk_str)
        return self._call_instruction("recalculateReputation", [case_id, agent_pk], agent_context=agent_pk_str)

    # ═══════════════════════════════════════════════════════════
    # IPFS
    # ═══════════════════════════════════════════════════════════

    def commit_transcript(self, transcript: dict) -> tuple[str, bool]:
        return upload_to_ipfs(transcript, pinata_jwt=self._pinata_jwt)

    # ═══════════════════════════════════════════════════════════
    # DEBATE ORCHESTRATION (yields utterances for streaming)
    # ═══════════════════════════════════════════════════════════

    async def run_debate_streaming(self, config: DebateConfig) -> AsyncGenerator[dict, None]:
        """
        Run a multi-round AI agent debate, yielding each utterance for WebSocket streaming.
        Yields dicts: {type, agent, content, round, role}
        """
        transcript = {
            "task": config.task,
            "agents": config.agents,
            "rounds": [],
            "votes": {},
            "final_output": "",
            "timestamp": time.time(),
        }

        agent_positions = {}

        for round_num in range(1, config.rounds + 1):
            round_data = {"round": round_num, "utterances": []}

            yield {"type": "status", "content": f"Round {round_num} starting...", "round": round_num}

            for agent_name in config.agents:
                agent_model = config.models.get(agent_name, config.model)
                role = "debater"
                if config.topology == 1:
                    role = "generator" if agent_name == config.agents[0] else "validator"

                # In decentralized mode, we YIELD a request and wait for the router to provide the response
                utterance = yield {
                    "type": "request_utterance",
                    "agent": agent_name,
                    "round": round_num,
                    "role": role,
                    "task": config.task,
                    "case_id": config.case_id if hasattr(config, 'case_id') else None,
                    "prior_utterances": round_data["utterances"]
                }
                
                if utterance is None:
                    utterance = f"*{agent_name[:8]} remained silent.*"

                round_data["utterances"].append({"agent": agent_name, "content": utterance})
                agent_positions[agent_name] = utterance

                yield {"type": "utterance", "agent": agent_name, "content": utterance, "round": round_num, "role": role}

            transcript["rounds"].append(round_data)

        # Collect votes
        # In decentralized mode, agents vote on-chain autonomously. 
        # The Hub just waits to see them appear on Solana.
        yield {"type": "status", "content": "Agents are voting on-chain..."}
        
        # Synthesis can still be done by the Hub or a designated lead agent
        yield {"type": "status", "content": "Synthesizing debate conclusion..."}
        
        all_utterances = []
        for r in transcript["rounds"]:
            all_utterances.extend(r["utterances"])
            
        try:
            summary = await asyncio.to_thread(
                self._get_llm_utterance,
                "SwarmCourt Judge",
                config.task,
                config.rounds + 1,
                all_utterances,
                config.model,
                role="summarizer"
            )
        except Exception as e:
            print(f"Summarizer error: {e}")
            summary = "Debate concluded. Waiting for on-chain finalization."
            
        transcript["final_output"] = summary
        yield {"type": "utterance", "agent": "SwarmCourt Hub", "content": summary, "round": config.rounds + 1, "role": "summarizer"}

        yield {"type": "complete", "content": "Debate complete", "data": {"transcript": transcript}}

    # ═══════════════════════════════════════════════════════════
    # LLM CALLS
    # ═══════════════════════════════════════════════════════════

    def _get_llm_utterance(self, agent, task, round_num, prior_utterances, model,
                           topology: int = 0, is_lead: bool = False, role: str = "debater") -> str:
        provider = "groq"
        model_name = model
        if ":" in model:
            provider, model_name = model.split(":", 1)

        prior_context = "\n".join(f"{u['agent']}: {u['content']}" for u in prior_utterances)

        system_prompts = {
            "debater": (f"You are {agent}, an expert AI in a structured debate.\n"
                       f"Task: {task}\nRound: {round_num}\n\n"
                       f"Rules:\n- State your position clearly.\n- Critique others.\n- Max 150 words."),
            "generator": (f"You are {agent}, the LEAD CREATOR. Task: {task}.\n"
                         f"CRITICAL: Do NOT ask the user for more information. "
                         f"Make reasonable assumptions and output the ACTUAL high-quality content immediately."),
            "validator": (f"You are {agent}, a REVIEWER. Task: {task}.\n"
                         f"Critique the current draft for quality and errors. Suggest specific improvements."),
            "refiner": (f"You are {agent}, the LEAD CREATOR. REWRITE the content to incorporate all feedback.\n"
                       f"CRITICAL: Output ONLY the final content. No introductions, no pleasantries."),
            "summarizer": f"You are the SwarmCourt Judge. Synthesize the debate conclusion into a final summary.",
        }
        system = system_prompts.get(role, f"You are {agent}. Task: {task}.")
        user_msg = f"Context:\n{prior_context}\n\nAction: Provide your {role} response for {task}:"

        return self._call_llm(provider, model_name, system, user_msg, max_tokens=4096)

    def _get_llm_vote(self, agent, task, final_position, model, topology: int = 0) -> int:
        provider = "groq"
        model_name = model
        if ":" in model:
            provider, model_name = model.split(":", 1)

        if topology == 0:
            system = f"You are {agent}. Vote 0 or 1. Respond ONLY with the digit."
            user_msg = f"Task: {task}\nYour position: {final_position}\nVote:"
        else:
            system = f"You are {agent}, a Validator. Vote 0 (PASS) or 1 (FAIL). Respond ONLY with the digit."
            user_msg = f"Task: {task}\nEvaluate the FINAL OUTPUT. Is it high quality?\nOutput: {final_position}\nVote:"

        text = self._call_llm(provider, model_name, system, user_msg, max_tokens=10)
        return self._extract_vote(text)

    def _call_llm(self, provider: str, model_name: str, system: str, user_msg: str, max_tokens: int = 4096) -> str:
        if provider == "groq":
            from groq import Groq
            client = Groq()
            resp = client.chat.completions.create(
                model=model_name, max_tokens=max_tokens,
                messages=[{"role": "system", "content": system}, {"role": "user", "content": user_msg}],
            )
            return resp.choices[0].message.content.strip()
        elif provider == "openai":
            from openai import OpenAI
            client = OpenAI()
            resp = client.chat.completions.create(
                model=model_name, max_tokens=max_tokens,
                messages=[{"role": "system", "content": system}, {"role": "user", "content": user_msg}],
            )
            return resp.choices[0].message.content.strip()
        elif provider == "gemini":
            client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
            resp = client.models.generate_content(
                model=model_name, contents=user_msg, config={'system_instruction': system}
            )
            return resp.text.strip()
        else:
            raise ValueError(f"Unknown provider: {provider}")

    def _extract_vote(self, text: str) -> int:
        match = re.search(r'[01]', text)
        if match:
            return int(match.group(0))
        return 0

    def analyze_task(self, user_prompt: str) -> dict:
        """Use Gemini to deconstruct a raw user prompt into binary choices."""
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            return {"refined_task": user_prompt, "option_a": "Option 0", "option_b": "Option 1"}

        client = genai.Client(api_key=api_key)
        prompt = (
            f"Analyze the following user prompt for a decentralized SwarmCourt debate.\n"
            f"PROMPT: {user_prompt}\n\n"
            f"TASKS:\n1. Refine the question for an AI debate (keep it neutral).\n"
            f"2. Identify two distinct binary choices (Option A and Option B).\n\n"
            f"Output strictly as JSON:\n"
            f'{{\"refined_task\": \"...\", \"option_a\": \"...\", \"option_b\": \"...\"}}'
        )
        try:
            response = client.models.generate_content(model="gemini-2.5-flash", contents=prompt)
            text = response.text.strip()
            if "```json" in text:
                text = text.split("```json")[1].split("```")[0].strip()
            elif "```" in text:
                text = text.split("```")[1].split("```")[0].strip()
            return json.loads(text)
        except Exception as e:
            print(f"⚠ AI Analysis failed: {e}")
            return {"refined_task": user_prompt, "option_a": "Agree", "option_b": "Disagree"}
