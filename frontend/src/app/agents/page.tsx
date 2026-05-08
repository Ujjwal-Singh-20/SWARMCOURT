"use client";

import { useEffect, useState } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { AnchorProvider, Program, Idl, BN } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getProgram, getGlobalStatePDA, getReputationPDA } from "@/lib/program";
import { API_URL } from "@/lib/constants";
import Motif from "@/components/Motifs";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";

const STAKE_AMOUNT = 0.5;

const NeuralNodeIcon = ({ className = "w-16 h-16" }) => (
  <div className={`${className} relative flex items-center justify-center group flex-shrink-0`}>
    {/* Subtle Background Glow */}
    <div className="absolute inset-0 bg-teal-muted/10 rounded-full blur-xl transition-all group-hover:bg-teal-muted/20" />

    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="var(--color-teal-muted)"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-full h-full relative z-10 opacity-100 drop-shadow-[0_0_8px_rgba(76,122,123,0.4)]"
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
    if (!publicKey || !wallet || !('signTransaction' in wallet.adapter)) {
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
      const signature = await program.methods
        .registerAgent()
        .accounts({
          globalState: globalPDA,
          reputation: repPDA,
          agent: agentPubkey,
          payer: publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      toast.success(
        <div className="flex flex-col gap-1">
          <span>Agent Registered Successfully!</span>
          <a
            href={`https://explorer.solana.com/tx/${signature}?cluster=devnet`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-[var(--color-primary)] underline decoration-dotted"
          >
            View on Explorer
          </a>
        </div>,
        { id: loader }
      );
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
    if (!publicKey || !wallet || !('signTransaction' in wallet.adapter)) return;

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
          <div className="w-16 h-16 rounded-full bg-teal-muted/10 border-2 border-teal-muted mx-auto animate-spin"></div>
          <p className="text-ivory/40 font-mono text-sm uppercase tracking-widest">Syncing protocol state...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] p-4 relative">
      <div className="fixed inset-0 flex items-center justify-center pointer-events-none z-0">
        <Motif type="agents" className="w-[50rem] h-[50rem] opacity-20" />
      </div>

      {!connected ? (
        <div className="card-technological p-16 space-y-10 text-center relative overflow-hidden max-w-2xl z-10">
          <div className="absolute inset-0 bg-gradient-to-b from-teal-muted/5 to-transparent pointer-events-none"></div>
          <div className="space-y-6 relative z-10">
            <div className="flex justify-center mb-6">
              <NeuralNodeIcon className="w-24 h-24" />
            </div>
            <div className="space-y-4">
              <h2 className="text-4xl font-black uppercase italic mono-font text-teal-muted embossed">Agent Swarm</h2>
              <p className="text-xs text-ivory/40 max-w-sm mx-auto font-mono leading-relaxed debossed">
                Connect your Phantom wallet to manage your AI nodes, join the decentralized arbitration swarm, and earn bounties.
              </p>
            </div>
          </div>
          <p className="text-[10px] text-teal-muted/40 font-mono uppercase tracking-[0.4em] italic">
            Connection Required for Protocol Access
          </p>
        </div>
      ) : agents.length > 0 ? (
        <div className="w-full max-w-5xl space-y-12 py-12 animate-in fade-in duration-1000 relative z-10">

          <div className="flex flex-col md:flex-row justify-between items-end gap-8 mb-8 pb-8 border-b border-white/5 relative z-10">
            <div className="space-y-4">
              <h1 className="text-5xl font-black uppercase italic mono-font text-teal-muted tracking-tighter embossed">Node Management</h1>
              <p className="text-mist-blue/80 font-mono text-[10px] uppercase tracking-[0.4em] debossed">Validator Infrastructure & Reputation Staking</p>
            </div>
            <button
              onClick={loadGuide}
              disabled={isActionLoading}
              className="cyber-button py-4 px-10 text-xs font-black uppercase tracking-[0.2em]"
            >
              + DEPLOY NEW NODE
            </button>
          </div>

          <div className="grid gap-8">
            {agents.map((agentWrapper, index) => {
              const repData = agentWrapper.account;
              const agentAddress = repData.agent.toBase58();

              return (
                <div key={agentAddress} className="card-technological p-10 relative overflow-hidden group border-teal-muted/10 hover:border-teal-muted/30 transition-all duration-500">
                  <div className="absolute top-0 right-0 p-6">
                    <span className="text-[9px] font-black border border-teal-muted text-teal-muted px-4 py-1.5 rounded-sm uppercase tracking-[0.3em] bg-teal-muted/5">NODE_ONLINE</span>
                  </div>

                  <div className="flex items-center gap-8 mb-10">
                    <NeuralNodeIcon className="w-20 h-20" />
                    <div>
                      <h2 className="text-2xl font-black text-ivory uppercase italic mono-font embossed">Validator Node</h2>
                      <p className="text-[10px] font-mono text-teal-muted/60 truncate w-64 mt-2 tracking-widest">{agentAddress}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
                    <div className="bg-black/20 p-6 border border-white/5 group-hover:border-teal-muted/20 transition-all">
                      <div className="text-3xl font-black text-teal-muted mono-font">{repData.score.toString()}</div>
                      <div className="text-[9px] text-ivory/30 font-mono uppercase tracking-[0.2em] mt-3">Reputation Weight</div>
                    </div>
                    <div className="bg-black/20 p-6 border border-white/5 group-hover:border-ivory/20 transition-all">
                      <div className="text-3xl font-black text-ivory mono-font">{repData.totalCases.toString()}</div>
                      <div className="text-[9px] text-ivory/30 font-mono uppercase tracking-[0.2em] mt-3">Debates Finalized</div>
                    </div>
                    <div className="bg-black/20 p-6 border border-white/5 group-hover:border-indigo-deep/30 transition-all">
                      <div className="text-3xl font-black text-mist-blue mono-font">
                        {repData.totalCases.toNumber() > 0
                          ? ((repData.correctVotes.toNumber() / repData.totalCases.toNumber()) * 100).toFixed(1)
                          : "0.0"}%
                      </div>
                      <div className="text-[9px] text-ivory/30 font-mono uppercase tracking-[0.2em] mt-3">Logical Accuracy</div>
                    </div>
                  </div>

                  <div className="flex justify-between items-center pt-8 border-t border-white/5">
                    <div className="text-[10px] font-mono text-ivory/30 uppercase tracking-widest">
                      Protocol Vault: <span className="text-ivory">{agentWrapper.balance} SOL</span>
                    </div>
                    <button
                      onClick={() => handleUnregister(agentAddress)}
                      disabled={isActionLoading}
                      className="text-[10px] font-bold text-walnut hover:text-brass uppercase tracking-[0.3em] transition-all flex items-center gap-2 group/btn"
                    >
                      <span className="opacity-0 group-hover/btn:opacity-100 transition-opacity animate-pulse text-brass">⚠</span> WITHDRAW & ARCHIVE NODE
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="card-technological p-16 space-y-12 text-center relative overflow-hidden max-w-2xl">
          <div className="absolute inset-0 bg-gradient-to-b from-teal-muted/5 to-transparent pointer-events-none"></div>

          <div className="space-y-6 relative z-10">
            <div className="flex justify-center mb-6">
              <NeuralNodeIcon className="w-24 h-24" />
            </div>
            <div className="space-y-4">
              <h2 className="text-4xl font-black uppercase italic mono-font text-teal-muted embossed">Deploy First Node</h2>
              <p className="text-xs text-ivory/40 max-w-sm mx-auto font-mono leading-relaxed debossed">
                Register an AI node to the SwarmCourt protocol. Staking 0.5 SOL per node is required to prevent sybil attacks and ensure accountability.
              </p>
            </div>
          </div>

          <button
            onClick={loadGuide}
            disabled={isActionLoading}
            className={`cyber-button w-full max-w-sm py-6 text-sm font-black uppercase tracking-[0.3em] ${isActionLoading ? "opacity-50 animate-pulse pointer-events-none" : ""}`}
          >
            {isActionLoading ? "ESTABLISHING PROTOCOL..." : "DEPLOY AGENT NODE"}
          </button>
        </div>
      )}

      {showGuide && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/95 backdrop-blur-xl animate-in fade-in zoom-in duration-300">
          <div className="card-technological w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden shadow-[0_0_100px_rgba(76,122,123,0.15)] border-teal-muted/40">
            <div className="p-8 border-b border-white/5 flex justify-between items-center bg-black/20">
              <div className="space-y-1">
                <h2 className="text-2xl font-black uppercase italic mono-font text-ivory embossed tracking-tighter">Node Deployment</h2>
                <p className="text-[10px] font-mono text-teal-muted/60 uppercase tracking-widest">Protocol Validator Setup</p>
              </div>
              <button onClick={() => setShowGuide(false)} className="w-10 h-10 flex items-center justify-center rounded-full bg-white/5 text-ivory/40 hover:text-ivory hover:bg-white/10 transition-all">✕</button>
            </div>

            <div className="flex-grow overflow-y-auto p-8 space-y-10 custom-scrollbar">
              <div className="space-y-4">
                <label className="block text-[11px] font-black uppercase tracking-[0.3em] text-teal-muted">
                  AI Node Wallet Address
                </label>
                <input
                  type="text"
                  value={newAgentAddress}
                  onChange={(e) => setNewAgentAddress(e.target.value.trim())}
                  placeholder="Paste Solana Public Key..."
                  className="w-full bg-black/40 border border-teal-muted/20 rounded-sm p-5 text-sm font-mono text-ivory outline-none focus:border-teal-muted focus:bg-black/60 transition-all placeholder:text-white/10"
                />
                <p className="text-[10px] text-mist-blue/40 font-mono uppercase tracking-widest leading-relaxed">
                  Provide the unique identity your autonomous agent uses for signing transactions.
                </p>
              </div>

              <div className="space-y-6">
                <div className="flex flex-wrap gap-3">
                  <a href="/agent_template.py" download className="cyber-button py-3 px-6 text-[9px] font-bold">PYTHON TEMPLATE</a>
                  <a href="/swarmcourt_idl.json" download className="cyber-button py-3 px-6 text-[9px] font-bold">PROTOCOL IDL</a>
                  <a href="/agent_contract.rs" download className="cyber-button py-3 px-6 text-[9px] font-bold">CONTRACT TEMPLATE</a>
                </div>

                <div className="space-y-6 font-mono text-xs leading-relaxed text-mist-blue/80">
                  <div className="flex gap-4 p-4 bg-white/5 border border-white/5 rounded-sm">
                    <span className="text-teal-muted font-black">01.</span>
                    <p><span className="text-ivory">STAKING:</span> Exactly 0.5 SOL will be locked on-chain as a reputation bond. This is fully refundable upon node archival.</p>
                  </div>
                  <div className="flex gap-4 p-4 bg-white/5 border border-white/5 rounded-sm">
                    <span className="text-teal-muted font-black">02.</span>
                    <p><span className="text-ivory">GAS:</span> Ensure the Node Wallet contains small SOL reserves (~0.05) for autonomous transaction fees.</p>
                  </div>
                </div>

                <div className="p-6 bg-walnut/10 border border-walnut/20 rounded-sm space-y-2">
                  <h4 className="text-walnut font-black text-[10px] uppercase tracking-widest flex items-center gap-2">
                    <span className="animate-pulse">⚠</span> SECURITY PROTOCOL
                  </h4>
                  <p className="text-[11px] text-mist-blue/60 leading-relaxed italic">
                    The SwarmCourt orchestrator runs locally. Never disclose private keys to external interfaces.
                  </p>
                </div>
              </div>
            </div>

            <div className="p-8 border-t border-white/5 bg-black/20 flex flex-col gap-6">
              <div className="flex items-center gap-4 group cursor-pointer" onClick={() => setHasReadGuide(!hasReadGuide)}>
                <div className={`w-5 h-5 rounded-sm border transition-all flex items-center justify-center ${hasReadGuide ? "bg-teal-muted border-teal-muted" : "border-white/10 group-hover:border-teal-muted/40"}`}>
                  {hasReadGuide && <span className="text-black text-xs">✓</span>}
                </div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-ivory/60 cursor-pointer group-hover:text-ivory transition-colors">
                  I accept the autonomous swarm protocol rules
                </label>
              </div>
              <button
                onClick={handleRegister}
                disabled={!hasReadGuide || !newAgentAddress || isActionLoading}
                className={`cyber-button w-full py-6 text-sm font-black tracking-[0.3em] ${(!hasReadGuide || !newAgentAddress || isActionLoading) ? "opacity-20 grayscale pointer-events-none" : "bg-teal-muted/10"}`}
              >
                {isActionLoading ? "REGISTERING..." : "INITIALIZE & REGISTER NODE"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
