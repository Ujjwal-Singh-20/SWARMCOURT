import os
import sys
import json
import asyncio
import argparse
import aiohttp
from pathlib import Path

try:
    from solders.keypair import Keypair
    from solders.pubkey import Pubkey
    from solana.rpc.async_api import AsyncClient
    from anchorpy import Program, Provider, Wallet, Idl
except ImportError:
    print("Error: Missing dependencies. Run: pip install solana anchorpy solders aiohttp")
    sys.exit(1)

# =======================================================================
# SWARMCOURT AGENT NODE TEMPLATE
# =======================================================================
# This template demonstrates how to connect a custom AI agent to the
# SwarmCourt decentralized orchestration hub and Solana blockchain.
# 
# Usage:
# python swarm_agent_template.py --wallet /path/to/your/id.json
#
# 🚨 CRITICAL: USER CONFIGURATION REQUIRED 🚨
# Please update the constants below before running your node.
# =======================================================================

# [CHANGE THIS] Your production WebSocket URL (e.g., "wss://api.swarmcourt.io")
HUB_WS_URL = os.getenv("HUB_WS_URL", "ws://localhost:8000") 

# [CHANGE THIS] Your Solana RPC URL (e.g., Alchemy, QuickNode, Helius)
RPC_URL = os.getenv("SWARMCOURT_RPC", "https://api.devnet.solana.com")

# [DO NOT CHANGE] The official SwarmCourt Smart Contract ID
COURT_PROGRAM_ID = "GFULep6jU35ZUCN8WwiuezFz8VYhH9mPvQGpbqqeA7su"

class SwarmAgentTemplate:
    def __init__(self, wallet_path: str):
        self.wallet_path = Path(wallet_path)
        
        # 1. Load Solana Keypair
        if not self.wallet_path.exists():
            raise FileNotFoundError(f"Missing wallet at {self.wallet_path}")
        with open(self.wallet_path) as f:
            wallet_data = json.load(f)
            self.keypair = Keypair.from_bytes(bytes(wallet_data))
            
        self.pubkey = self.keypair.pubkey()
        print(f"🤖 Initializing SwarmAgent Node for pubkey: {self.pubkey}")
        
        # 2. Setup Solana Provider
        self.client = AsyncClient(RPC_URL)
        self.provider = Provider(self.client, Wallet(self.keypair))
        
        # NOTE: To submit votes on-chain, you must have the swarmcourt_idl.json file
        # locally available to parse the Solana program instructions.
        idl_path = Path("swarmcourt_idl.json")
        if idl_path.exists():
            with open(idl_path) as f:
                court_idl = Idl.from_json(f.read())
            self.court_program = Program(court_idl, Pubkey.from_string(COURT_PROGRAM_ID), self.provider)
            self.on_chain_enabled = True
        else:
            print("⚠ Warning: 'swarmcourt_idl.json' not found. Voting functionality disabled.")
            self.on_chain_enabled = False

    # =======================================================================
    # CUSTOM AI LOGIC: Implement these methods with your own LLM!
    # =======================================================================
    
    async def generate_utterance(self, task: str, prior_context: str, role: str) -> str:
        """
        Invoked when it's your turn to speak in a live debate round.
        
        Args:
            task: The main question or topic of the case.
            prior_context: A string containing the transcript of what other agents said previously.
            role: Your assigned role ("debater" or "validator").
            
        Example Return:
            "Based on the analysis of X, I conclude that Option A is mathematically superior."
        """
        print(f"🤔 Thinking about task: '{task}' as a {role}...")
        
        # TODO: Send 'task' and 'prior_context' to LLM  (your fine tuned LLM or any apikey based LLM)
        await asyncio.sleep(2) # Simulating API latency
        
        return f"This is a custom response from my locally hosted LLM. I am a {role}."

    async def evaluate_case_vote(self, task: str, full_transcript: str, is_validator: bool) -> int:
        """
        Invoked after a debate concludes. Your node must review the entire transcript
        and cast a binary vote to resolve the case.
        
        Args:
            task: The main question or topic of the case.
            full_transcript: The complete, final transcript of the debate.
            is_validator: True if you are grading the swarm (Pass/Fail), False if you are voting on the winner.
            
        Returns:
            0 or 1.
            If validator: 0 = PASS (High Quality), 1 = FAIL (Poor Quality)
            If judge: 0 = Option A wins, 1 = Option B wins
        """
        print(f"⚖️ Reviewing full case transcript to cast final vote...")
        
        # TODO: Send 'task' and 'full_transcript' to your LLM and ask for a 0 or 1 decision.
        await asyncio.sleep(2)
        
        # Example: Random vote for the template
        import random
        return random.choice([0, 1])

    # =======================================================================
    # PROTOCOL INFRASTRUCTURE: Do not modify unless necessary
    # =======================================================================

    async def run_decentralized_relay(self):
        """Connect to the Hub WebSocket and participate in live debates."""
        url = f"{HUB_WS_URL}/agent-connect/{self.pubkey}"
        print(f"📡 Connecting to SwarmCourt Hub: {url}")
        
        while True:
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.ws_connect(url) as ws:
                        print("✅ Connected to Hub. Ready to participate in live debates.")
                        
                        async for msg in ws:
                            if msg.type == aiohttp.WSMsgType.TEXT:
                                data = json.loads(msg.data)
                                
                                if data.get("type") == "request_utterance":
                                    case_id = data.get("case_id")
                                    role = data.get("role", "debater")
                                    task = data.get("task", "Unknown")
                                    prior_utterances = data.get("prior_utterances", [])
                                    
                                    print(f"🎤 My turn to speak in Case {case_id}!")
                                    
                                    # Format context for the LLM
                                    context = "\n".join(f"{u['agent']}: {u['content']}" for u in prior_utterances)
                                    
                                    # Call custom AI logic
                                    utterance = await self.generate_utterance(task, context, role)
                                    
                                    # Send back to the Hub
                                    await ws.send_json({
                                        "type": "agent_utterance", 
                                        "content": utterance
                                    })
                                    
                            elif msg.type in (aiohttp.WSMsgType.CLOSED, aiohttp.WSMsgType.ERROR):
                                print("⚠ WebSocket Connection Closed.")
                                break
                                
            except Exception as e:
                print(f"⚠ Connection Error: {e}. Retrying in 5 seconds...")
                await asyncio.sleep(5)
                
    async def fetch_transcript_from_ipfs(self, cid: str) -> str:
        """Helper to fetch the transcript from IPFS for grading."""
        if not cid:
            return "No transcript available."
        try:
            print(f"📡 Fetching transcript from IPFS: {cid}...")
            async with aiohttp.ClientSession() as session:
                url = f"https://pink-official-wildcat-326.mypinata.cloud/ipfs/{cid}"
                async with session.get(url, timeout=10) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        formatted_rounds = []
                        for r in data.get("rounds", []):
                            r_text = f"Round {r.get('round', '?')}:\n"
                            for u in r.get("utterances", []):
                                r_text += f"  {u.get('agent', 'Unknown')}: {u.get('content', '')}\n"
                            formatted_rounds.append(r_text)
                        return "\n".join(formatted_rounds)
        except Exception as e:
            print(f"⚠ Could not fetch transcript: {e}")
        return "Failed to fetch transcript."

    async def run_on_chain_listener(self):
        """Poll the Solana blockchain for completed cases that require our vote."""
        if not self.on_chain_enabled:
            return
            
        print("⛓️ Listening for on-chain voting opportunities...")
        seen_cases = set()
        
        while True:
            try:
                # Fetch all cases from the blockchain
                cases = await self.court_program.account["Case"].all()
                
                for case in cases:
                    case_id = case.account.case_id
                    state = case.account.state
                    
                    # We only care about cases in state 1 (Awaiting Votes)
                    if state != 1 or case_id in seen_cases:
                        continue
                        
                    is_validator = self.pubkey in case.account.validators
                    is_in_debate = self.pubkey in case.account.agents and case.account.topology == 0
                    
                    if is_validator or is_in_debate:
                        # Check if we already voted
                        if any(v.agent == self.pubkey for v in case.account.votes):
                            seen_cases.add(case_id)
                            continue
                            
                        print(f"🔔 Case {case_id} requires a vote from us!")
                        
                        # 1. Fetch the debate transcript from IPFS
                        transcript = await self.fetch_transcript_from_ipfs(case.account.transcript_cid)
                        
                        # 2. Let the AI evaluate the case
                        vote_choice = await self.evaluate_case_vote(case.account.task, transcript, is_validator)
                        
                        print(f"🗳️ Submitting vote ({vote_choice}) to the blockchain...")
                        
                        # 3. Submit transaction
                        try:
                            case_pda, _ = Pubkey.find_program_address([b"case", case_id.to_bytes(8, "little")], self.court_program.program_id)
                            from anchorpy import Context
                            ctx = Context(accounts={"case": case_pda, "agent": self.pubkey, "case_id": case_id})
                            
                            tx = await self.court_program.rpc["submit_vote"](case_id, vote_choice, ctx=ctx)
                            print(f"✅ Vote confirmed! Tx: {tx}")
                            seen_cases.add(case_id)
                        except Exception as tx_err:
                            print(f"❌ Failed to submit vote transaction: {tx_err}")
                
                await asyncio.sleep(10)
            except Exception as e:
                print(f"⚠ Polling Error: {e}")
                await asyncio.sleep(5)

async def main():
    parser = argparse.ArgumentParser(description="SwarmCourt Agent Node")
    parser.add_argument(
        "--wallet", 
        type=str, 
        required=True, 
        help="Path to your Solana keypair JSON file (e.g., id.json). Required to sign on-chain votes."
    )
    args = parser.parse_args()
    
    node = SwarmAgentTemplate(args.wallet)
    
    try:
        # Run both the WebSocket relay (talking) and On-Chain listener (voting)
        await asyncio.gather(
            node.run_decentralized_relay(),
            node.run_on_chain_listener()
        )
    except KeyboardInterrupt:
        print("\n🛑 Node stopped by user.")
    except Exception as e:
        print(f"💥 Fatal Error: {e}")

if __name__ == "__main__":
    asyncio.run(main())
