"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { PublicKey, SystemProgram, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { toast } from "sonner";
import Motif from "@/components/Motifs";
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

    if (activeAgents !== null && activeAgents < activeTier!.agents) {
      toast.error(`Network Capacity Error: Need ${activeTier!.agents} active nodes for ${activeTier!.label}, but only ${activeAgents} are online.`);
      setIsSubmitting(false);
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

      if (!ADMIN_WALLET) {
        toast.error("Protocol Error: Admin wallet not configured.");
        setIsSubmitting(false);
        return;
      }
      const officialAdminPubkey = new PublicKey(ADMIN_WALLET);
      const globalStatePDA = getGlobalStatePDA();

      toast.loading("Step 1: Signing on-chain transaction...", { id: loadingToast });

      const ix = await program.methods
        .openCase(new BN(caseId), task, tier, topology, bountyLamports)
        .accounts({
          case: getCasePDA(caseId),
          creator: publicKey,
          adminWallet: officialAdminPubkey,
          globalState: globalStatePDA,
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
    <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700 relative">
      <div className="fixed inset-0 flex items-center justify-center pointer-events-none z-0">
        <Motif type="lawroom" className="w-[45rem] h-[45rem] opacity-20" />
      </div>

      <div className="flex justify-center mb-4 relative z-10">
        <div className="card-judicial px-6 py-2 flex items-center gap-3 border-brass/20 bg-black/40">
          <div className={`w-2 h-2 rounded-full animate-pulse ${activeAgents !== null && activeAgents > 0 ? "bg-brass shadow-[0_0_10px_rgba(176,141,87,0.6)]" : "bg-walnut"}`} />
          <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-ivory/60">
            Network Integrity: {activeAgents !== null ? `${activeAgents} Validator Nodes Online` : "Initializing..."}
          </span>
        </div>
      </div>

      <div className="text-center space-y-4 mb-16 relative z-10">
        <h1 className="text-5xl font-black uppercase italic serif-font text-ivory embossed tracking-tighter">Initialize Protocol</h1>
        <p className="text-brass font-serif italic text-sm uppercase tracking-[0.4em] debossed">Formal Dispute Drafting & Evidence Submission</p>
      </div>

      <div className="card-judicial p-10 space-y-10 opacity-70">
        <div className="space-y-4">
          <label className="text-[11px] font-black uppercase tracking-[0.4em] text-brass debossed">The Task / Question</label>
          <textarea
            value={task}
            onChange={(e) => setTask(e.target.value)}
            placeholder="e.g., Which sorting algorithm is more efficient here?"
            className="w-full h-40 bg-black/40 border border-brass/10 rounded-sm p-6 text-ivory font-serif italic focus:border-brass/40 focus:outline-none transition-all resize-none shadow-inner"
            maxLength={250}
          />
          <div className="text-right text-[10px] text-ivory/20 font-mono uppercase tracking-widest">{task.length} / 250</div>
        </div>

        <div className="space-y-6">
          <label className="text-[11px] font-black uppercase tracking-[0.4em] text-brass debossed">Protocol Topology</label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {TOPOLOGIES.map((t) => (
              <button
                key={t.id}
                onClick={() => setTopology(t.id)}
                className={`p-6 rounded-sm border text-left transition-all cursor-pointer ${topology === t.id ? "border-brass bg-brass/5 shadow-[0_0_20px_rgba(176,141,87,0.1)]" : "border-white/5 bg-black/20 hover:border-white/10"
                  }`}
              >
                <div className={`font-black uppercase italic serif-font tracking-wider ${topology === t.id ? "text-brass" : "text-ivory/40"}`}>{t.label}</div>
                <div className="text-[10px] text-ivory/30 mt-2 font-mono uppercase tracking-tight leading-relaxed">{t.description}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <label className="text-[11px] font-black uppercase tracking-[0.4em] text-brass debossed">Jury Tier</label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {JURY_TIERS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTier(t.id)}
                className={`p-6 rounded-sm border text-center transition-all cursor-pointer ${tier === t.id ? "border-teal-muted bg-teal-muted/5 shadow-[0_0_20px_rgba(76,122,123,0.1)]" : "border-white/5 bg-black/20 hover:border-white/10"
                  }`}
              >
                <div className={`font-black uppercase italic mono-font tracking-widest ${tier === t.id ? "text-teal-muted" : "text-ivory/40"}`}>{t.label}</div>
                <div className="text-xl font-mono mt-3 text-ivory">{t.bounty} SOL</div>
                <div className="text-[9px] text-ivory/30 mt-2 font-mono uppercase tracking-[0.2em]">{t.agents} Nodes Assigned</div>
              </button>
            ))}
          </div>
        </div>

        <div className="pt-10 border-t border-white/10 flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="text-[10px] text-ivory/20 font-mono uppercase tracking-[0.4em] italic">Est. Protocol Fee: 5% Artifacting</div>
          <button
            onClick={handleCreateCase}
            disabled={isSubmitting || !connected}
            className={`wax-seal-button min-w-[280px] ${isSubmitting ? "opacity-50" : ""}`}
          >
            {isSubmitting ? "SEALING..." : `Stake & Initialize (${activeTier!.bounty} SOL)`}
          </button>
        </div>
      </div>
    </div>
  );
}
