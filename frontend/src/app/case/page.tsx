"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { PublicKey, SystemProgram, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { toast } from "sonner";
import { getProgram, getGlobalStatePDA, getCasePDA } from "@/lib/program";
import { ADMIN_WALLET, JURY_TIERS, TOPOLOGIES, API_URL } from "@/lib/constants";
import { BN, AnchorProvider } from "@coral-xyz/anchor";

export default function CaseCreationPage() {
  const router = useRouter();
  const { publicKey, signTransaction, signAllTransactions, wallet, connected } = useWallet();
  const { connection } = useConnection();
  
  const [task, setTask] = useState("");
  const [tier, setTier] = useState(1);
  const [topology, setTopology] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeAgents, setActiveAgents] = useState<number | null>(null);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch(`${API_URL}/agents/status/active?t=${Date.now()}`, { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          setActiveAgents(data.count);
        }
      } catch (err) {
        console.error("Failed to fetch network status", err);
      }
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  const activeTier = JURY_TIERS.find((t) => t.id === tier);

  const handleCreateCase = async () => {
    if (!connected || !publicKey || !wallet || !signTransaction || !signAllTransactions) {
      toast.error("Please connect your wallet first");
      return;
    }
    if (!task.trim()) {
      toast.error("Please enter a task/question");
      return;
    }

    setIsSubmitting(true);
    const loadingToast = toast.loading("Initiating Case Creation...");

    try {
      // Setup Anchor Provider
      const anchorWallet = {
        publicKey: publicKey,
        signTransaction: signTransaction,
        signAllTransactions: signAllTransactions,
      };
      
      const provider = new AnchorProvider(connection, anchorWallet as any, { commitment: "confirmed" });
      const program = getProgram(provider);

      const caseId = Math.floor(Date.now() / 1000);
      const bountyLamports = new BN((activeTier!.bounty * 1_000_000_000).toString());
      const adminPubkey = ADMIN_WALLET ? new PublicKey(ADMIN_WALLET) : publicKey;

      toast.loading("Step 1: Signing on-chain transaction...", { id: loadingToast });
      
      const ix = await program.methods
        .openCase(new BN(caseId), task, tier, topology, bountyLamports)
        .accounts({
          case: getCasePDA(caseId),
          creator: publicKey,
          adminWallet: adminPubkey,
          globalState: getGlobalStatePDA(),
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      const latestBlockhash = await connection.getLatestBlockhash();
      const messageV0 = new TransactionMessage({
        payerKey: publicKey,
        recentBlockhash: latestBlockhash.blockhash,
        instructions: [ix],
      }).compileToV0Message();

      const tx = new VersionedTransaction(messageV0);
      const signedTx = await signTransaction(tx);
      
      let signature = "";
      try {
        toast.loading("Sending transaction to Solana Devnet...", { id: loadingToast });
        signature = await connection.sendRawTransaction(signedTx.serialize());
        
        toast.loading("Waiting for confirmation...", { id: loadingToast });
        await connection.confirmTransaction({
          signature,
          blockhash: latestBlockhash.blockhash,
          lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
        });
      } catch (txError: any) {
        const errStr = txError.message ? txError.message.toLowerCase() : "";
        const errFull = txError.toString().toLowerCase();
        const logsStr = txError.logs ? txError.logs.join(" ").toLowerCase() : "";
        
        if (
          errStr.includes("already been processed") || 
          errStr.includes("0x0") ||
          errFull.includes("already been processed") ||
          logsStr.includes("already been processed") ||
          logsStr.includes("already processed")
        ) {
          console.warn("Transaction was already processed by the network. Proceeding...");
          // Fallback to get signature from the transaction itself
          const txSigBuffer = signedTx.signatures[0];
          const bs58Module = await import("bs58");
          const encode = bs58Module.encode || (bs58Module.default && bs58Module.default.encode);
          if (encode) {
            signature = encode(txSigBuffer);
          } else {
            signature = "signature_recovered_from_tx";
          }
        } else {
          throw txError;
        }
      }

      // Step 2: Inform Backend
      toast.loading("Step 2: Syncing with SwarmCourt AI...", { id: loadingToast });
      
      const res = await fetch(`${API_URL}/cases/open-case`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          case_id: caseId,
          task: task,
          jury_tier: tier,
          topology: topology,
          bounty_amount: activeTier!.bounty,
          tx_signature: signature || "signature_recovered_from_tx",
        }),
      });

      if (!res.ok) {
        let errText = await res.text();
        throw new Error(`Backend synchronization failed: ${errText}`);
      }

      toast.success("Protocol Initialized Successfully!", { id: loadingToast });
      router.push(`/case/${caseId}`);

    } catch (error: any) {
      console.error(error);
      toast.error(`Error: ${error.message || "Failed to initialize protocol"}`, { id: loadingToast });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
      <div className="flex justify-center mb-4">
        <div className="glass-panel px-4 py-1.5 flex items-center gap-2 border-white/5 bg-black/20">
          <div className={`w-2 h-2 rounded-full animate-pulse ${activeAgents !== null && activeAgents > 0 ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" : "bg-red-500"}`} />
          <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-gray-400">
            Network Status: {activeAgents !== null ? `${activeAgents} Seed Nodes Active` : "Initializing..."}
          </span>
        </div>
      </div>

      <div className="text-center space-y-2 mb-12">
        <h1 className="text-4xl font-black uppercase neon-text">Initialize Protocol</h1>
        <p className="text-gray-400 font-mono text-sm">Stake bounty in protocol escrow and summon the autonomous AI Swarm.</p>
      </div>

      <div className="glass-panel p-8 space-y-8">
        <div className="space-y-2">
          <label className="text-sm font-bold uppercase tracking-wider text-[var(--color-primary)]">The Task / Question</label>
          <textarea
            value={task}
            onChange={(e) => setTask(e.target.value)}
            placeholder="e.g., Which sorting algorithm is more efficient here?"
            className="w-full h-32 bg-black/50 border border-white/10 rounded p-4 text-white font-mono focus:border-[var(--color-primary)] focus:outline-none transition-all resize-none"
            maxLength={250}
          />
          <div className="text-right text-xs text-gray-500 font-mono">{task.length} / 250</div>
        </div>

        <div className="space-y-4">
          <label className="text-sm font-bold uppercase tracking-wider text-[var(--color-primary)]">Protocol Topology</label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {TOPOLOGIES.map((t) => (
              <button
                key={t.id}
                onClick={() => setTopology(t.id)}
                className={`p-4 rounded border text-left transition-all ${
                  topology === t.id ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10" : "border-white/5 bg-black/30"
                }`}
              >
                <div className={`font-bold ${topology === t.id ? "text-[var(--color-primary)]" : "text-gray-300"}`}>{t.label}</div>
                <div className="text-xs text-gray-500 mt-1">{t.description}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <label className="text-sm font-bold uppercase tracking-wider text-[var(--color-primary)]">Jury Tier</label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {JURY_TIERS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTier(t.id)}
                className={`p-4 rounded border text-center transition-all ${
                  tier === t.id ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10" : "border-white/5 bg-black/30"
                }`}
              >
                <div className={`font-bold ${tier === t.id ? "text-[var(--color-accent)]" : "text-gray-300"}`}>{t.label}</div>
                <div className="text-lg font-mono mt-2 text-white">{t.bounty} SOL</div>
                <div className="text-xs text-gray-500 mt-1">{t.agents} Nodes</div>
              </button>
            ))}
          </div>
        </div>

        <div className="pt-8 border-t border-white/10 flex justify-between items-center">
          <div className="text-sm text-gray-400 font-mono italic">Est. Protocol Fee: 5%</div>
          <button
            onClick={handleCreateCase}
            disabled={isSubmitting || !connected}
            className={`neon-button px-12 ${isSubmitting ? "opacity-50" : ""}`}
          >
            {isSubmitting ? "Processing..." : `Stake & Initialize (${activeTier!.bounty} SOL)`}
          </button>
        </div>
      </div>
    </div>
  );
}
