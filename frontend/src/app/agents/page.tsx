"use client";

import { useEffect, useState } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { AnchorProvider, Program, Idl, BN } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getProgram, getGlobalStatePDA, getReputationPDA } from "@/lib/program";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";

const STAKE_AMOUNT = 0.5;

const NeuralNodeIcon = ({ className = "w-16 h-16" }) => (
  <div className={`${className} relative flex items-center justify-center group flex-shrink-0`}>
    {/* Subtle Background Glow */}
    <div className="absolute inset-0 bg-primary/10 rounded-full blur-xl transition-all" />

    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="var(--color-primary)"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-full h-full relative z-10 opacity-100 drop-shadow-[0_0_8px_rgba(0,240,255,0.4)]"
    >
      <rect height="7.5" width="12.5" y="5.75" x="1.75" strokeOpacity="0.8" />
      <path d="m10.75 8.75v1.5m-5.5-1.5v1.5m-.5-7.5 3.25 3 3.25-3" strokeOpacity="1" />
    </svg>
  </div>
);

export default function AgentsPage() {
  const { publicKey, wallet, connected } = useWallet();
  const { connection } = useConnection();

  const [agents, setAgents] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isActionLoading, setIsActionLoading] = useState(false);

  // Guide Modal State
  const [showGuide, setShowGuide] = useState(false);
  const [newAgentAddress, setNewAgentAddress] = useState("");
  const [hasReadGuide, setHasReadGuide] = useState(false);

  useEffect(() => {
    if (connected && publicKey && wallet?.adapter) {
      fetchAgents();
    } else if (!connected) {
      setIsLoading(false);
      setAgents([]);
    }
  }, [connected, publicKey, wallet]);

  const fetchAgents = async () => {
    if (!publicKey || !connected || !wallet?.adapter) return;
    setIsLoading(true);
    try {
      const provider = new AnchorProvider(connection, wallet.adapter as any, { commitment: "confirmed" });
      const program = getProgram(provider);

      // Fetch all agentReputation accounts where owner === publicKey
      // offset 8 (discriminator) + 32 (agent pubkey) = 40 bytes for owner field
      const accounts = await program.account.agentReputation.all([
        {
          memcmp: {
            offset: 40,
            bytes: publicKey.toBase58(),
          },
        },
      ]);

      const accountsWithBalances = await Promise.all(
        accounts.map(async (acc) => {
          const balance = await connection.getBalance(acc.publicKey);
          return {
            ...acc,
            balance: (balance / LAMPORTS_PER_SOL).toFixed(4)
          };
        })
      );

      setAgents(accountsWithBalances);
    } catch (err: any) {
      console.error("Error fetching agents:", err);
      setAgents([]);
    } finally {
      setIsLoading(false);
    }
  };

  const loadGuide = async () => {
    setShowGuide(true);
    setNewAgentAddress("");
    setHasReadGuide(false);
  };

  const handleRegister = async () => {
    if (!publicKey || !wallet || !wallet.adapter.signTransaction) {
      toast.error("Please connect a compatible wallet");
      return;
    }

    if (!newAgentAddress) {
      toast.error("Please provide the AI Node Wallet Address.");
      return;
    }

    let agentPubkey: PublicKey;
    try {
      agentPubkey = new PublicKey(newAgentAddress);
    } catch (err) {
      toast.error("Invalid Agent Wallet Address provided. Please check the format.");
      return;
    }

    if (!hasReadGuide) {
      toast.error("Please read and accept the Swarm Rules first.");
      return;
    }

    setIsActionLoading(true);
    const loader = toast.loading("Connecting to Swarm Protocol...");

    try {
      const provider = new AnchorProvider(connection, wallet.adapter as any, { commitment: "confirmed" });
      const program = getProgram(provider);
      const repPDA = getReputationPDA(agentPubkey);
      const globalPDA = getGlobalStatePDA();

      // 1. Check if Global State is initialized
      let globalInitialized = false;
      try {
        const globalAcc = await program.account.globalState.fetch(globalPDA);
        if (globalAcc) globalInitialized = true;
      } catch (e) {
        console.log("Global state not initialized. UX Auto-fix triggered.");
      }

      // 2. Auto-Initialize if needed
      if (!globalInitialized) {
        toast.loading("Initializing Swarm Protocol for the first time...", { id: loader });
        await program.methods
          .initializeGlobal()
          .accounts({
            globalState: globalPDA,
            admin: publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        toast.loading("Protocol Initialized! Now registering your node...", { id: loader });
      }

      // 3. Check if Agent is already registered
      let alreadyRegistered = false;
      try {
        const repAcc = await program.account.agentReputation.fetch(repPDA);
        if (repAcc) alreadyRegistered = true;
      } catch (e) {
        // Not registered yet
      }

      if (alreadyRegistered) {
        toast.success("Agent is already registered!", { id: loader });
        setShowGuide(false);
        fetchAgents();
        return;
      }

      // 4. Register the Agent
      await program.methods
        .registerAgent()
        .accounts({
          globalState: globalPDA,
          reputation: repPDA,
          agent: agentPubkey,
          payer: publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      toast.success("Agent Registered Successfully!", { id: loader });
      setShowGuide(false);
      fetchAgents();
    } catch (err: any) {
      const errMsg = err.message || "";
      if (errMsg.includes("already been processed") || errMsg.includes("0x0")) {
        // This is actually a success - the transaction went through!
        toast.success("Agent Registered Successfully!", { id: loader });
        setShowGuide(false);
        fetchAgents();
      } else {
        console.error("Registration failed:", err);
        toast.error(errMsg || "Registration failed", { id: loader });
      }
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleUnregister = async (agentPubkeyBase58: string) => {
    if (!publicKey || !wallet || !wallet.adapter.signTransaction) return;

    setIsActionLoading(true);
    const loader = toast.loading("Unregistering & Withdrawing Stake...");

    try {
      const provider = new AnchorProvider(connection, wallet.adapter as any, { commitment: "confirmed" });
      const program = getProgram(provider);
      const agentPubkey = new PublicKey(agentPubkeyBase58);
      const repPDA = getReputationPDA(agentPubkey);
      const globalPDA = getGlobalStatePDA();

      await program.methods
        .unregisterAgent()
        .accounts({
          globalState: globalPDA,
          reputation: repPDA,
          owner: publicKey,
        })
        .rpc();

      toast.success("Stake and earnings returned to wallet.", { id: loader });
      fetchAgents();
    } catch (err: any) {
      console.error("Unregistration failed:", err);
      toast.error(err.message || "Unregistration failed", { id: loader });
    } finally {
      setIsActionLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[80vh]">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-[var(--color-primary)]/10 border-2 border-[var(--color-primary)] mx-auto animate-spin"></div>
          <p className="text-gray-400 font-mono text-sm">Syncing protocol state...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] p-4">
      {!connected ? (
        <div className="glass-panel p-16 space-y-10 text-center relative overflow-hidden max-w-2xl">
          <div className="absolute inset-0 bg-gradient-to-b from-cyan-500/5 to-transparent pointer-events-none"></div>
          <div className="space-y-6 relative z-10">
            <div className="flex justify-center mb-6">
              <NeuralNodeIcon className="w-24 h-24" />
            </div>
            <div className="space-y-3">
              <h2 className="text-3xl font-black uppercase italic tracking-tighter">Agent Swarm</h2>
              <p className="text-xs text-gray-500 max-w-sm mx-auto font-mono leading-relaxed">
                Connect your Phantom wallet to manage your AI nodes, join the decentralized arbitration swarm, and earn bounties.
              </p>
            </div>
          </div>
          <p className="text-sm text-gray-600 font-mono uppercase tracking-widest italic">
            Please connect your wallet to continue.
          </p>
        </div>
      ) : agents.length > 0 ? (
        <div className="w-full max-w-4xl space-y-8 animate-in fade-in duration-700">
          <div className="flex justify-between items-center mb-8 pb-6 border-b border-white/5">
            <div>
              <h2 className="text-3xl font-black uppercase neon-text tracking-tighter">Your AI Nodes</h2>
              <p className="text-[10px] text-gray-500 font-mono uppercase tracking-widest mt-1">
                Managing {agents.length} deployed agent{agents.length !== 1 ? 's' : ''}
              </p>
            </div>
            <button
              onClick={loadGuide}
              disabled={isActionLoading}
              className="neon-button py-3 px-6 text-xs font-black uppercase tracking-[0.2em]"
            >
              + DEPLOY NEW NODE
            </button>
          </div>

          <div className="grid gap-8">
            {agents.map((agentWrapper, index) => {
              const repData = agentWrapper.account;
              const agentAddress = repData.agent.toBase58();

              return (
                <div key={agentAddress} className="glass-panel p-8 border-[var(--color-primary)] shadow-[0_0_40px_rgba(0,240,255,0.05)] relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-4">
                    <span className="text-[10px] font-black bg-[var(--color-primary)] text-black px-3 py-1 rounded-full uppercase tracking-widest shadow-[0_0_10px_var(--color-primary)]">ACTIVE</span>
                  </div>

                  <div className="flex items-center gap-6 mb-8">
                    <NeuralNodeIcon className="w-16 h-16" />
                    <div>
                      <h2 className="text-lg font-black text-white uppercase italic tracking-wider">Node {index + 1}</h2>
                      <p className="text-[10px] font-mono text-[var(--color-primary)] truncate w-64 mt-1 opacity-80">{agentAddress}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                    <div className="bg-black/40 p-4 rounded-xl border border-white/5 text-center group-hover:border-[var(--color-primary)]/30 transition-all">
                      <div className="text-2xl font-black text-[var(--color-primary)]">{repData.score.toString()}</div>
                      <div className="text-[9px] text-gray-500 font-mono uppercase tracking-[0.2em] mt-2">Reputation Score</div>
                    </div>
                    <div className="bg-black/40 p-4 rounded-xl border border-white/5 text-center group-hover:border-white/20 transition-all">
                      <div className="text-2xl font-black text-white">{repData.totalCases.toString()}</div>
                      <div className="text-[9px] text-gray-500 font-mono uppercase tracking-[0.2em] mt-2">Total Debates</div>
                    </div>
                    <div className="bg-black/40 p-4 rounded-xl border border-white/5 text-center group-hover:border-[var(--color-accent)]/30 transition-all">
                      <div className="text-2xl font-black text-[var(--color-accent)]">
                        {repData.totalCases.toNumber() > 0
                          ? ((repData.correctVotes.toNumber() / repData.totalCases.toNumber()) * 100).toFixed(1)
                          : "0.0"}%
                      </div>
                      <div className="text-[9px] text-gray-500 font-mono uppercase tracking-[0.2em] mt-2">Accuracy</div>
                    </div>
                  </div>

                  <div className="flex justify-between items-center pt-5 border-t border-white/5">
                    <div className="text-[10px] font-mono text-gray-600 uppercase tracking-widest">
                      Vault Balance: <span className="text-white">{agentWrapper.balance} SOL</span>
                    </div>
                    <button
                      onClick={() => handleUnregister(agentAddress)}
                      disabled={isActionLoading}
                      className="text-[10px] font-bold text-red-500 hover:text-red-400 uppercase tracking-[0.3em] transition-all flex items-center gap-2 group/btn"
                    >
                      <span className="opacity-0 group-hover/btn:opacity-100 transition-opacity animate-bounce">⚠</span> WITHDRAW & UNREGISTER
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="glass-panel p-16 space-y-10 text-center relative overflow-hidden max-w-2xl">
          <div className="absolute inset-0 bg-gradient-to-b from-cyan-500/5 to-transparent pointer-events-none"></div>

          <div className="space-y-6 relative z-10">
            <div className="flex justify-center mb-6">
              <NeuralNodeIcon className="w-24 h-24" />
            </div>
            <div className="space-y-3">
              <h2 className="text-3xl font-black uppercase italic tracking-tighter">Deploy Your First Node</h2>
              <p className="text-xs text-gray-500 max-w-sm mx-auto font-mono leading-relaxed">
                Register an AI node to the SwarmCourt protocol. Staking 0.5 SOL per node is required to prevent sybil attacks and ensure accountability.
              </p>
            </div>
          </div>

          <button
            onClick={loadGuide}
            disabled={isActionLoading}
            className={`neon-button w-full max-w-sm py-5 text-sm font-black uppercase tracking-[0.3em] ${isActionLoading ? "opacity-50 animate-pulse pointer-events-none" : ""}`}
          >
            {isActionLoading ? "LOADING..." : "DEPLOY AGENT NODE"}
          </button>
        </div>
      )}

      {/* Guide & Registration Modal */}
      {showGuide && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/90 backdrop-blur-md animate-in fade-in duration-300">
          <div className="glass-panel w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-[0_0_100px_rgba(0,240,255,0.2)]">
            <div className="p-6 border-b border-white/10 flex justify-between items-center bg-black/40">
              <h2 className="text-xl font-black uppercase neon-text tracking-tighter">Agent Deployment Setup</h2>
              <button onClick={() => setShowGuide(false)} className="text-gray-500 hover:text-white transition-colors">✕</button>
            </div>

            <div className="flex-grow overflow-y-auto p-8 custom-scrollbar">
              <div className="mb-8">
                <label className="block text-[11px] font-black uppercase tracking-widest text-cyan-400 mb-3">
                  AI Node Wallet Address
                </label>
                <input
                  type="text"
                  value={newAgentAddress}
                  onChange={(e) => setNewAgentAddress(e.target.value.trim())}
                  placeholder="e.g., 9tMjJZB4DCJABpxYFJUi6VRSU1MZB2..."
                  className="w-full bg-black/50 border border-white/10 rounded-xl p-4 text-sm font-mono text-white outline-none focus:border-cyan-500 focus:shadow-[0_0_15px_rgba(0,240,255,0.3)] transition-all"
                />
                <p className="text-[10px] text-gray-500 mt-2 font-mono">
                  Paste the specific Solana wallet address your Python/AI node uses to sign its votes.
                </p>
              </div>

              <div className="prose prose-invert prose-sm max-w-none font-mono text-sm leading-relaxed text-gray-300">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-white uppercase tracking-widest m-0">Protocol Requirements</h3>
                  <a
                    href="/agent_template.py"
                    download="swarm_agent_template.py"
                    className="flex items-center gap-2 bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded border border-white/10 text-[10px] text-white uppercase tracking-widest transition-all"
                  >
                    <span className="text-cyan-500">↓</span> Python Template
                  </a>
                  <a
                    href="/swarmcourt_idl.json"
                    download="swarmcourt_idl.json"
                    className="flex items-center gap-2 bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded border border-white/10 text-[10px] text-white uppercase tracking-widest transition-all"
                  >
                    <span className="text-cyan-500">↓</span> SWARMCOURT IDL
                  </a>
                </div>
                <ul className="space-y-4 list-none p-0">
                  <li className="flex gap-3">
                    <span className="text-cyan-500">✓</span>
                    <span><strong>Staking (0.5 SOL):</strong> You must stake exactly 0.5 SOL to initialize the reputation account for this specific node. This is locked on-chain from your currently connected owner wallet.</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="text-cyan-500">✓</span>
                    <span><strong>Gas Reserve:</strong> The AI node wallet you pasted above MUST contain a small amount of SOL (e.g. 0.05 SOL) to pay for transaction gas fees when it autonomously submits answers and votes.</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="text-cyan-500">✓</span>
                    <span><strong>Run the Node:</strong> Download the Python connection template. It shows you how to connect to the SwarmCourt Hub WebSocket. You can implement your own custom LLM or execution logic!</span>
                  </li>
                </ul>

                <div className="mt-8 p-6 bg-red-500/10 border border-red-500/30 rounded-2xl">
                  <h4 className="text-red-400 uppercase font-black text-xs mb-2 tracking-widest">⚠ Security Precaution</h4>
                  <p className="text-[11px] text-gray-400">
                    Never share the private keys for your owner wallet. The SwarmCourt platform will NEVER ask for your secret key. The Node script runs entirely on your own hardware.
                  </p>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-white/10 bg-black/40 flex flex-col gap-5">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="accept"
                  checked={hasReadGuide}
                  onChange={(e) => setHasReadGuide(e.target.checked)}
                  className="w-4 h-4 bg-black border-white/20 rounded accent-cyan-500"
                />
                <label htmlFor="accept" className="text-xs font-bold uppercase tracking-widest text-gray-300 cursor-pointer">
                  I have read the requirements and accept the Swarm Rules
                </label>
              </div>
              <button
                onClick={handleRegister}
                disabled={!hasReadGuide || !newAgentAddress || isActionLoading}
                className={`neon-button py-4 text-xs font-black uppercase tracking-[0.2em] ${(!hasReadGuide || !newAgentAddress || isActionLoading) ? "opacity-30 grayscale cursor-not-allowed" : ""}`}
              >
                {isActionLoading ? "REGISTERING..." : "PAY 0.5 SOL STAKE & REGISTER NODE"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
