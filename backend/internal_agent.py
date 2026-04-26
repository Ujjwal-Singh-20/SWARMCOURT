import os
import sys
import json
import asyncio
import aiohttp
import base58
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

try:
    from solders.keypair import Keypair
    from solders.pubkey import Pubkey
    from solana.rpc.async_api import AsyncClient
    from anchorpy import Program, Provider, Wallet, Idl
    from google import genai
except ImportError:
    print("Error: Missing dependencies. Run: pip install solana anchorpy solders aiohttp google-genai base58")
    sys.exit(1)

# =======================================================================
# INTERNAL SWARMCOURT AGENT NODE
# =======================================================================

HUB_WS_URL = os.getenv("HUB_WS_URL", "ws://localhost:8000")
RPC_URL = os.getenv("SOLANA_RPC_URL", "https://api.devnet.solana.com")
COURT_PROGRAM_ID = os.getenv("PROGRAM_ID", "GFULep6jU35ZUCN8WwiuezFz8VYhH9mPvQGpbqqeA7su")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

class SwarmAgentNode:
    def __init__(self, secret_key_b58: str = None, wallet_path: str = None):
        # 1. Load Solana Keypair
        if secret_key_b58:
            print("🔑 Loading keypair from environment variable...")
            self.keypair = Keypair.from_base58_string(secret_key_b58)
        elif wallet_path:
            print(f"📂 Loading keypair from file: {wallet_path}")
            with open(wallet_path) as f:
                wallet_data = json.load(f)
                self.keypair = Keypair.from_bytes(bytes(wallet_data))
        else:
            raise ValueError("Must provide either secret_key_b58 or wallet_path")
            
        self.pubkey = self.keypair.pubkey()
        print(f"🤖 Initializing SwarmAgent Node: {self.pubkey}")
        
        # 2. Setup Solana Provider
        self.client = AsyncClient(RPC_URL)
        self.provider = Provider(self.client, Wallet(self.keypair))
        
        # 3. Load IDL
        idl_path = Path("swarmcourt_idl.json")
        if idl_path.exists():
            with open(idl_path) as f:
                court_idl = Idl.from_json(f.read())
            self.court_program = Program(court_idl, Pubkey.from_string(COURT_PROGRAM_ID), self.provider)
            self.on_chain_enabled = True
        else:
            print("⚠ Warning: 'swarmcourt_idl.json' not found. Voting disabled.")
            self.on_chain_enabled = False
        
        # 4. Setup AI (Gemini)
        if not GEMINI_API_KEY:
            print("⚠ GEMINI_API_KEY not found. LLM calls will fail.")
            self.ai_client = None
        else:
            self.ai_client = genai.Client(api_key=GEMINI_API_KEY)
            self.model_id = "gemini-2.0-flash"
            print("🧠 Gemini AI Engine Initialized")

    async def generate_utterance(self, task: str, prior_context: str, role: str) -> str:
        if not self.ai_client: return "AI not configured."
        persona = "You are a sharp debater in the SwarmCourt autonomous multi-agent swarm."
        prompt = (
            f"You are {self.pubkey}, a {role} in a live SwarmCourt debate.\n"
            f"TASK: {task}\n\nPRIOR DEBATE:\n{prior_context}\n\n"
            f"Provide your {role} response (max 100 words)."
        )
        try:
            response = await asyncio.to_thread(
                self.ai_client.models.generate_content,
                model=self.model_id, contents=prompt, config={'system_instruction': persona}
            )
            return response.text.strip()
        except Exception as e:
            print(f"❌ LLM Error: {e}")
            return "I encountered an error while processing my thoughts."

    async def evaluate_case_vote(self, task: str, full_transcript: str, is_validator: bool) -> int:
        if not self.ai_client: return 0
        prompt = (
            f"Evaluate this SwarmCourt {'Validation' if is_validator else 'Debate'}.\n"
            f"TASK: {task}\n\nTRANSCRIPT:\n{full_transcript}\n\n"
            f"VOTE '0' for PASS/A, '1' for FAIL/B. Respond with ONLY '0' or '1'."
        )
        try:
            response = await asyncio.to_thread(
                self.ai_client.models.generate_content,
                model=self.model_id, contents=prompt
            )
            return 0 if "0" in response.text else 1
        except Exception as e:
            print(f"❌ LLM Voting Error: {e}")
            return 0

    async def run_decentralized_relay(self):
        url = f"{HUB_WS_URL}/agent-connect/{self.pubkey}"
        print(f"📡 Connecting to Hub: {url}")
        while True:
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.ws_connect(url) as ws:
                        print(f"✅ Connected to Hub as {self.pubkey}")
                        async for msg in ws:
                            if msg.type == aiohttp.WSMsgType.TEXT:
                                data = json.loads(msg.data)
                                if data.get("type") == "request_utterance":
                                    utterance = await self.generate_utterance(
                                        data.get("task", ""), 
                                        "\n".join(f"{u['agent']}: {u['content']}" for u in data.get("prior_utterances", [])),
                                        data.get("role", "debater")
                                    )
                                    await ws.send_json({"type": "agent_utterance", "content": utterance})
                            elif msg.type in (aiohttp.WSMsgType.CLOSED, aiohttp.WSMsgType.ERROR):
                                break
            except Exception as e:
                await asyncio.sleep(5)

    async def fetch_transcript_from_ipfs(self, cid: str) -> str:
        if not cid: return "No transcript."
        try:
            gateway = os.getenv("IPFS_GATEWAY", "https://pink-official-wildcat-326.mypinata.cloud/ipfs")
            async with aiohttp.ClientSession() as session:
                url = f"{gateway}/{cid}"
                async with session.get(url, timeout=10) as resp:
                    if resp.status == 200:
                        data = await resp.json(content_type=None)
                        return str(data)
        except: pass
        return "Failed to fetch transcript."

    async def run_on_chain_listener(self):
        if not self.on_chain_enabled: return
        print(f"⛓️ {self.pubkey} listening for on-chain votes...")
        seen_cases = set()
        while True:
            try:
                cases = await self.court_program.account["Case"].all()
                for case in cases:
                    case_id = case.account.case_id
                    if case.account.state != 1 or case_id in seen_cases: continue
                    if self.pubkey in case.account.validators or (self.pubkey in case.account.agents and case.account.topology == 0):
                        if any(v.agent == self.pubkey for v in case.account.votes):
                            seen_cases.add(case_id)
                            continue
                        transcript = await self.fetch_transcript_from_ipfs(case.account.transcript_cid)
                        vote_choice = await self.evaluate_case_vote(case.account.task, transcript, self.pubkey in case.account.validators)
                        case_pda, _ = Pubkey.find_program_address([b"case", case_id.to_bytes(8, "little")], self.court_program.program_id)
                        from anchorpy import Context
                        await self.court_program.rpc["submit_vote"](case_id, vote_choice, ctx=Context(accounts={"case": case_pda, "agent": self.pubkey, "case_id": case_id}))
                        seen_cases.add(case_id)
                await asyncio.sleep(15)
            except Exception as e:
                await asyncio.sleep(5)

async def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--secret", type=str, help="Base58 secret key")
    parser.add_argument("--wallet", type=str, help="Path to wallet JSON")
    args = parser.parse_args()
    
    secret = args.secret or os.getenv("AGENT_SECRET")
    node = SwarmAgentNode(secret_key_b58=secret, wallet_path=args.wallet)
    await asyncio.gather(node.run_decentralized_relay(), node.run_on_chain_listener())

if __name__ == "__main__":
    asyncio.run(main())
