"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { WS_URL, API_URL } from "@/lib/constants";
import ReactMarkdown from "react-markdown";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { toast } from "sonner";
import { BN, AnchorProvider } from "@coral-xyz/anchor";
import { getProgram, getCasePDA } from "@/lib/program";

type Message = {
  type: "status" | "utterance" | "vote" | "vote_status" | "finalized" | "error" | "done" | "complete";
  content: string;
  agent?: string;
  round?: number;
  role?: string;
  data?: any;
};

export default function WarRoomPage() {
  const params = useParams();
  const caseId = params.id as string;
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeAgents, setActiveAgents] = useState<string[]>([]);
  const [currentSpeaker, setCurrentSpeaker] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [finalResult, setFinalResult] = useState<any>(null);
  const [topology, setTopology] = useState<number>(0);
  const [caseState, setCaseState] = useState<number>(0);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const { publicKey, connected, wallet, signTransaction, signAllTransactions } = useWallet();
  const { connection } = useConnection();
  const wsRef = useRef<WebSocket | null>(null);
  const feedEndRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const pollingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const initPage = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/cases/${caseId}`);
      const data = await response.json();

      if (data.success && data.case) {
        // Case found!
        const c = data.case;
        setActiveAgents(c.agents);
        setTopology(c.topology);
        setCaseState(c.state);

        if (c.state === 0) {
          startWebSocket();
        }

        if (c.state >= 1) {
          setIsDone(true);
          fetchArchive();
          if (c.state >= 3) {
            setFinalResult({
              winner: c.final_choice,
              tx: "On-Chain Archive",
              hasFeedback: c.has_feedback,
              satisfied: c.user_satisfied,
              rating: c.user_rating
            });
          }
        }
      } else {
        // Case not found yet due to RPC propagation delay. Poll again in 2s.
        pollingTimeoutRef.current = setTimeout(initPage, 2000);
      }
    } catch (err) {
      console.error("Failed to initialize court room:", err);
      pollingTimeoutRef.current = setTimeout(initPage, 2000);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchArchive = async () => {
    try {
      const response = await fetch(`${API_URL}/cases/${caseId}/transcript`);
      const data = await response.json();
      if (data.success && data.transcript) {
        const t = data.transcript;
        const archiveMsgs: Message[] = [];

        // 1. Flatten utterances from rounds
        if (t.rounds && Array.isArray(t.rounds)) {
          t.rounds.forEach((r: any) => {
            if (r.utterances && Array.isArray(r.utterances)) {
              r.utterances.forEach((u: any) => {
                archiveMsgs.push({
                  type: "utterance",
                  content: u.content,
                  agent: u.agent,
                  round: r.round,
                  role: u.role || "debater"
                });
              });
            }
          });
        }

        // 2. Handle legacy flat utterances if they exist
        if (t.utterances && Array.isArray(t.utterances)) {
          t.utterances.forEach((u: any) => {
            archiveMsgs.push({
              type: "utterance",
              content: u.content,
              agent: u.agent,
              round: u.round,
              role: u.role || "debater"
            });
          });
        }

        // 3. Add final output if it exists
        if (t.final_output) {
          archiveMsgs.push({
            type: "utterance",
            content: t.final_output,
            agent: "SwarmCourt Judge",
            round: (t.rounds?.length || 0) + 1,
            role: "summarizer"
          });
          setFinalResult((prev: any) => ({ ...prev, final_output: t.final_output }));
        }

        // 4. Add votes
        if (t.votes) {
          Object.entries(t.votes).forEach(([agent, choice]) => {
            archiveMsgs.push({
              type: "vote",
              content: "",
              agent,
              data: { choice }
            });
          });
        }

        setMessages(archiveMsgs);
      } else {
        // Fallback for cases without transcript yet
        console.warn("Archive transcript not found or success is false");
      }
    } catch (err) {
      console.error("Failed to load archive:", err);
    }
  };
  const commitTranscriptOnChain = async (cid: string) => {
    if (!publicKey || !signTransaction) throw new Error("Wallet not connected");
    const anchorWallet = {
      publicKey,
      signTransaction,
      signAllTransactions,
    };
    const provider = new AnchorProvider(connection, anchorWallet as any, { commitment: "confirmed" });
    const program = getProgram(provider);
    const casePDA = getCasePDA(Number(caseId));

    return await program.methods
      .commitTranscript(new BN(caseId), cid)
      .accounts({
        case: casePDA,
        creator: publicKey,
      })
      .rpc();
  };

  const finalizeCaseOnChain = async () => {
    if (!publicKey || !signTransaction) throw new Error("Wallet not connected");
    const anchorWallet = {
      publicKey,
      signTransaction,
      signAllTransactions,
    };
    const provider = new AnchorProvider(connection, anchorWallet as any, { commitment: "confirmed" });
    const program = getProgram(provider);
    const casePDA = getCasePDA(Number(caseId));

    return await program.methods
      .finalizeCase(new BN(caseId))
      .accounts({
        case: casePDA,
        creator: publicKey,
      })
      .rpc();
  };

  const startWebSocket = () => {
    const ws = new WebSocket(`${WS_URL}/debate/${caseId}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      ws.send(JSON.stringify({
        task: "Resuming debate...",
        topology: 0,
        model: "groq:llama-3.1-8b-instant"
      }));
    };

    ws.onmessage = async (event) => {
      try {
        const msg: any = JSON.parse(event.data);
        setMessages((prev) => [...prev, msg]);

        if (msg.type === "utterance") {
          setCurrentSpeaker(msg.agent || null);
        } else if (msg.type === "request_onchain_commit") {
          // HUB is asking US to commit the transcript because it can't sign for us
          toast.info("Debate complete. Preparing on-chain transcript commit...");
          try {
            const signature = await commitTranscriptOnChain(msg.data.cid);
            toast.success("Transcript committed on-chain!");
            ws.send(JSON.stringify({ type: "onchain_commit_success", data: { tx: signature } }));
          } catch (err) {
            console.error("Failed to commit transcript:", err);
            toast.error("Failed to commit transcript on-chain.");
            ws.send(JSON.stringify({ type: "onchain_commit_error" }));
          }
        } else if (msg.type === "request_onchain_finalize") {
          // HUB is asking US to finalize because votes are in
          toast.info("Jury votes confirmed! Finalizing case...");
          try {
            const signature = await finalizeCaseOnChain();
            toast.success("Case finalized on-chain!");
            ws.send(JSON.stringify({ type: "onchain_finalize_success", data: { tx: signature } }));
          } catch (err) {
            console.error("Failed to finalize case:", err);
            toast.error("Failed to finalize case on-chain.");
            ws.send(JSON.stringify({ type: "onchain_finalize_error" }));
          }
        } else if (msg.type === "finalized") {
          setFinalResult(msg.data);
          if (msg.data.final_output) {
            setMessages((prev) => [...prev, {
              type: "utterance",
              content: msg.data.final_output,
              agent: "SwarmCourt Judge",
              round: 99,
              role: "summarizer"
            }]);
          }
        }

        if (msg.type === "done" || msg.type === "complete" || msg.type === "error") {
          setIsDone(true);
        }
      } catch (e) {
        console.error("WS Message Error:", e);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      setIsDone(true);
    };
  };

  useEffect(() => {
    if (!caseId) return;
    initPage();

    return () => {
      if (wsRef.current) wsRef.current.close();
      if (pollingTimeoutRef.current) clearTimeout(pollingTimeoutRef.current);
    };
  }, [caseId]);



  const handleSubmitFeedback = async (satisfied: boolean, rating: number = 5) => {
    if (!connected || !publicKey || !wallet || !signTransaction || !signAllTransactions) {
      toast.error("Please connect your wallet first");
      return;
    }

    const loader = toast.loading("Verifying protocol state...");
    try {
      const anchorWallet = {
        publicKey: publicKey,
        signTransaction: signTransaction,
        signAllTransactions: signAllTransactions,
      };
      const provider = new AnchorProvider(connection, anchorWallet as any, { commitment: "confirmed" });
      const program = getProgram(provider);
      const casePDA = getCasePDA(Number(caseId));

      // 0. Fetch fresh on-chain state to avoid race conditions
      let onChainCase = await program.account.case.fetch(casePDA);
      let currentState = Number(onChainCase.state);

      // 0.1 Wait for protocol to be ready (at least state 2 for finalization, or state 3 for feedback)
      let attempts = 0;
      while (currentState < 2 && attempts < 8) {
        toast.loading(`Synchronizing Protocol State (${attempts + 1}/8)...`, { id: loader });
        await new Promise(resolve => setTimeout(resolve, 3000));
        onChainCase = await program.account.case.fetch(casePDA);
        currentState = Number(onChainCase.state);
        attempts++;
      }

      // 1. Prepare Combined Transaction
      const { Transaction } = await import("@solana/web3.js");
      const tx = new Transaction();
      let isCombined = false;

      if (currentState < 3) {
        if (currentState < 2) {
          throw new Error("Case is not yet ready for finalization. Please wait for agents to vote.");
        }

        isCombined = true;
        toast.loading("Finalizing On-Chain State & Committing Feedback...", { id: loader });

        const finalizeInst = await program.methods
          .finalizeCase(new BN(caseId))
          .accounts({
            case: casePDA,
            creator: publicKey,
          })
          .instruction();
        tx.add(finalizeInst);
      } else {
        toast.loading("Committing protocol feedback on-chain...", { id: loader });
      }

      // Add Feedback Instruction
      const feedbackInst = await program.methods
        .submitFeedback(new BN(caseId), satisfied, rating)
        .accounts({
          case: casePDA,
          creator: publicKey,
        })
        .instruction();
      tx.add(feedbackInst);

      // 2. Execute Transaction (Single Popup)
      let signature = "";
      try {
        signature = await provider.sendAndConfirm(tx);
        console.log("Protocol Transaction Success:", signature);
      } catch (txError: any) {
        const errorMsg = txError.message || txError.toString();
        if (errorMsg.includes("already been processed") || errorMsg.includes("0x1775") || errorMsg.includes("FeedbackAlreadySubmitted")) {
          console.warn("Feedback transaction was already processed by the network. Proceeding...");
          signature = "already_processed_fallback";
        } else {
          throw txError;
        }
      }

      toast.loading("Autonomously recalibrating network reputations...", { id: loader });

      // 3. Inform Backend to sync
      const response = await fetch(`${API_URL}/cases/feedback/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          case_id: Number(caseId),
          tx_signature: signature
        })
      });

      const data = await response.json();
      if (data.success) {
        toast.success("Protocol Finalized Successfully!", { id: loader });
        setFinalResult((prev: any) => ({ ...prev, hasFeedback: true, rating, satisfied }));
        setCaseState(3);
      } else {
        throw new Error(data.message);
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Submission failed", { id: loader });
    }
  };

  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (isLoading) return (
    <div className="flex items-center justify-center h-[60vh]">
      <div className="text-center space-y-4">
        <div className="text-3xl font-black neon-text uppercase animate-pulse">Entering Court Room</div>
        <div className="text-[10px] font-mono text-gray-500 uppercase tracking-widest">Reconstructing Case State...</div>
      </div>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in duration-700">
      <div className="flex justify-between items-center glass-panel p-6">
        <div className="flex items-center gap-4">
          <Link href="/history" className="p-2 hover:bg-white/5 rounded-full transition-colors text-gray-500 hover:text-white group">
            <span className="text-lg group-hover:-translate-x-1 inline-block transition-transform">←</span>
          </Link>
          <h1 className="text-3xl font-black neon-text uppercase tracking-tighter">Case #{caseId}</h1>
          <div className={`px-3 py-1 rounded text-[10px] font-black tracking-widest uppercase ${!isDone ? "bg-[var(--color-primary)] text-black animate-pulse" :
            finalResult?.hasFeedback ? "bg-white/10 text-gray-400" : "bg-amber-500 text-black shadow-[0_0_15px_rgba(245,158,11,0.3)]"
            }`}>
            {!isDone ? "Live Debate" : finalResult?.hasFeedback ? "Completed" : "Feedback Required"}
          </div>
        </div>
        {!isDone && (
          <div className="flex items-center gap-2 text-[10px] font-mono text-cyan-500 uppercase">
            <span className="w-2 h-2 bg-cyan-500 rounded-full animate-ping"></span>
            Direct WebSocket Connection Active
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <div className="glass-panel p-6 space-y-6">
            <h2 className="text-xs font-bold uppercase text-gray-500 tracking-widest border-b border-white/5 pb-2">Swarm Nodes</h2>
            <div className="space-y-3">
              {activeAgents.map(a => (
                <div key={a} className={`p-4 rounded-xl border transition-all duration-500 ${currentSpeaker === a ? "border-[var(--color-primary)] bg-[var(--color-primary)]/5 shadow-[0_0_20px_rgba(0,240,255,0.1)]" : "border-white/5 bg-black/20"}`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${currentSpeaker === a ? "bg-[var(--color-primary)] animate-pulse" : "bg-gray-700"}`}></div>
                    <div className="text-[10px] font-mono text-white truncate w-full uppercase">{a.substring(0, 8)}...</div>
                  </div>
                </div>
              ))}
            </div>
          </div>          {isDone && (
            <div className="glass-panel p-8 border-[var(--color-accent)]/30 bg-[var(--color-accent)]/5 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">⚖️</div>
              <h3 className="text-xs font-black uppercase text-[var(--color-accent)] mb-4 tracking-[0.2em]">
                {caseState < 3 ? "Case Conclusion" : "Final Verdict"}
              </h3>

              <>
                {(!finalResult || !finalResult.hasFeedback) ? (
                  <div className="space-y-4">
                    <div className="text-4xl font-black text-white mb-2 uppercase italic tracking-tighter">
                      Consensus Reached
                    </div>
                    {/* {finalResult?.final_output && (
                      <div className="p-4 rounded-xl bg-black/40 border border-white/5 text-sm text-gray-300 font-sans mb-6">
                        <div className="text-[10px] font-black text-[var(--color-primary)] uppercase tracking-widest mb-2">Final Swarm Conclusion:</div>
                        {finalResult.final_output}
                      </div>
                    )} */}
                    <p className="text-[10px] text-gray-400 font-mono mb-6 leading-relaxed uppercase tracking-tighter">
                      {topology === 1
                        ? "The swarm has generated a result. Rate the quality (1-5):"
                        : "The debate has concluded. Did the swarm reach a satisfactory result?"}
                    </p>

                    {topology === 1 ? (
                      <div className="grid grid-cols-5 gap-2">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            key={star}
                            onClick={() => handleSubmitFeedback(star >= 3, star)}
                            className="py-3 rounded bg-white/5 border border-white/10 text-[10px] font-black text-white hover:bg-[var(--color-accent)] hover:text-black hover:border-[var(--color-accent)] transition-all uppercase"
                          >
                            {star}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-3">
                        <button onClick={() => handleSubmitFeedback(true, 5)} className="py-3 rounded bg-[var(--color-accent)]/20 border border-[var(--color-accent)] text-[10px] font-black text-[var(--color-accent)] hover:bg-[var(--color-accent)] hover:text-black transition-all uppercase tracking-widest">Satisfied</button>
                        <button onClick={() => handleSubmitFeedback(false, 1)} className="py-3 rounded bg-red-500/20 border border-red-500 text-[10px] font-black text-red-500 hover:bg-red-500 hover:text-white transition-all uppercase tracking-widest">Unsatisfied</button>
                      </div>
                    )}

                    {caseState < 3 && (
                      <div className="mt-6 p-4 rounded bg-black/30 border border-[var(--color-accent)]/20 shadow-[0_0_15px_rgba(245,158,11,0.05)]">
                        <p className="text-[9px] text-[var(--color-accent)] font-mono uppercase font-black tracking-[0.2em] flex items-center gap-2 mb-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] animate-pulse"></span>
                          Protocol Execution Trigger
                        </p>
                        <p className="text-[10px] text-gray-400 font-mono uppercase leading-relaxed tracking-wider">
                          Submitting this transaction finalizes the case state on the Solana blockchain. Protocol reputation scores will be autonomously recalibrated based on consensus alignment, and staked SOL will be slashed for mathematically underperforming nodes.
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="text-4xl font-black text-white mb-2 uppercase italic tracking-tighter">Consensus Reached</div>

                    {/* {finalResult?.final_output && (
                      <div className="p-4 rounded-xl bg-black/40 border border-white/5 text-sm text-gray-300 font-sans mb-6">
                        <div className="text-[10px] font-black text-[var(--color-primary)] uppercase tracking-widest mb-2">Final Swarm Conclusion:</div>
                        {finalResult.final_output}
                      </div>
                    )} */}

                    <p className="text-[9px] text-gray-500 font-mono uppercase mb-8">Resolution Source: On-Chain Consensus</p>
                    <div className="p-4 rounded bg-white/5 border border-white/10 text-center">
                      <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Feedback Submitted</div>
                      <div className="text-[10px] text-gray-600 font-mono mt-1 uppercase italic">
                        Rating: {finalResult.rating || (finalResult.satisfied ? 5 : 1)} / 5
                      </div>
                    </div>
                  </div>
                )}
              </>
            </div>
          )}
        </div>

        <div className="lg:col-span-3 glass-panel p-8 min-h-[70vh] flex flex-col bg-black/40 relative">
          <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]"></div>
          <div className="flex-grow relative z-10">
            {messages.length === 0 && (
              <div className="min-h-[60vh] flex flex-col items-center justify-center text-gray-400 font-mono text-sm italic space-y-4 text-center">
                <div className="animate-pulse flex flex-col items-center gap-4">
                  <div className="p-4 rounded-full bg-white/5 border border-white/10">
                    <span className="text-2xl">📡</span>
                  </div>
                  {isDone ? "RECONSTRUCTING PROTOCOL ARCHIVE..." : "WAITING FOR AGENTS TO BROADCAST..."}
                </div>
                {isDone && (
                  <div className="text-[10px] text-gray-500 not-italic uppercase tracking-[0.3em] max-w-xs leading-relaxed">
                    Fetching transcript rounds from IPFS and synchronizing with Solana state
                  </div>
                )}
              </div>
            )}
            <div className="space-y-8 overflow-y-auto max-h-[70vh] pr-4 custom-scrollbar">
              {messages.map((m, i) => (
                <div key={i} className="animate-in fade-in slide-in-from-left-4 duration-500">
                  {m.type === "utterance" && (
                    <div className="space-y-3 group">
                      <div className="flex items-center gap-3">
                        <div className="text-[10px] font-black text-[var(--color-primary)] uppercase tracking-[0.2em]">{m.agent?.substring(0, 8)}...</div>
                        <div className="h-px flex-grow bg-white/5 group-hover:bg-[var(--color-primary)]/20 transition-all"></div>
                        <div className="text-[9px] font-mono text-gray-700">ROUND {m.round}</div>
                      </div>
                      <div className="text-gray-300 text-sm leading-relaxed font-sans bg-white/[0.02] p-5 rounded-2xl border border-white/5 group-hover:border-[var(--color-primary)]/30 transition-all whitespace-pre-wrap">
                        {typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}
                      </div>
                    </div>
                  )}
                  {m.type === "vote" && (
                    <div className="flex items-center gap-4 py-2 opacity-60 hover:opacity-100 transition-opacity">
                      <div className="w-2 h-2 rounded-full bg-[var(--color-accent)]"></div>
                      <div className="text-[10px] font-mono text-gray-500 uppercase tracking-widest">
                        Protocol Evidence: Node <span className="text-white">{m.agent?.substring(0, 6)}</span> cast vote for <span className="text-[var(--color-accent)] font-bold">Option {m.data?.choice}</span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              <div ref={feedEndRef} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
