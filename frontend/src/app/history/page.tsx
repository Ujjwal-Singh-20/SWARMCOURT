"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { API_URL } from "@/lib/constants";
import { getCasePDA } from "@/lib/program";
import Motif from "@/components/Motifs";

type CaseItem = {
  id: string;
  task: string;
  state: number;
  has_feedback: boolean;
  bounty: number;
  date: number;
  topology: number;
};

export default function HistoryPage() {
  const { publicKey, connected } = useWallet();
  const router = useRouter();
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!connected || !publicKey) {
      setCases([]);
      setIsLoading(false);
      return;
    }

    const fetchHistory = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`${API_URL}/cases/user/${publicKey.toBase58()}`);
        const data = await response.json();
        if (data.success) {
          setCases(data.cases);
        }
      } catch (err) {
        console.error("Failed to fetch history:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchHistory();
  }, [connected, publicKey]);

  const getStateBadge = (state: number, hasFeedback: boolean) => {
    const baseClass = "text-[9px] font-mono px-3 py-1 rounded-sm border uppercase tracking-widest transition-all duration-300";
    if (state === 3) {
      if (!hasFeedback) return <span className={`${baseClass} border-walnut text-walnut bg-walnut/5`}>FEEDBACK REQUIRED</span>;
      return <span className={`${baseClass} border-teal-muted text-teal-muted bg-teal-muted/5`}>SEALED</span>;
    }
    if (state === 0) return <span className={`${baseClass} border-brass text-brass bg-brass/5 animate-pulse`}>OPEN</span>;
    return <span className={`${baseClass} border-graphite text-graphite bg-graphite/5`}>ARCHIVED</span>;
  };

  return (
    <div className="max-w-4xl mx-auto space-y-12 py-12 animate-in fade-in duration-1000 relative">
      <div className="fixed inset-0 flex items-center justify-center pointer-events-none z-0">
        <Motif type="archive" className="w-[45rem] h-[45rem] opacity-20" />
      </div>

      <div className="text-center space-y-4 relative z-10">
        <h1 className="text-5xl font-black uppercase italic serif-font text-ivory embossed">Protocol History</h1>
        <p className="text-brass/80 font-serif italic text-sm uppercase tracking-[0.4em] debossed">Archive of your on-chain interactions</p>
      </div>

      {!connected ? (
        <div className="glass-panel p-12 text-center text-gray-500 font-mono">
          PLEASE CONNECT WALLET TO VIEW HISTORY
        </div>
      ) : isLoading ? (
        <div className="glass-panel p-12 text-center text-gray-500 font-mono animate-pulse">
          ⚡ SYNCHRONIZING WITH SOLANA...
        </div>
      ) : cases.length === 0 ? (
        <div className="glass-panel p-12 text-center text-gray-500">No cases found.</div>
      ) : (
        <div className="grid gap-6">
          {cases.map(c => (
            <div
              key={c.id}
              onClick={() => router.push(`/case/${c.id}`)}
              className="card-judicial p-8 group cursor-pointer border-brass/10 hover:border-brass/30 transition-all duration-500"
            >
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <span className="text-[10px] text-brass/40 font-mono uppercase tracking-widest">#{c.id.padStart(6, '0')}</span>
                    {getStateBadge(c.state, c.has_feedback)}
                    <span className="text-[8px] font-mono text-mist-blue/30 border border-mist-blue/10 px-2 py-0.5 rounded-sm uppercase tracking-tighter">
                      {c.topology === 1 ? "GENERATOR-VALIDATOR" : "LINEAR DEBATE"}
                    </span>
                  </div>
                  <h3 className="text-xl md:text-2xl font-black serif-font italic text-ivory group-hover:text-brass transition-colors leading-tight">
                    {c.task}
                  </h3>
                  <div className="text-[10px] text-ivory/30 font-mono uppercase flex flex-wrap items-center gap-x-6 gap-y-2">
                    <div className="flex items-center gap-2">
                      <span className="w-1 h-1 bg-brass/30 rounded-full"></span>
                      <span>{new Date(c.date * 1000).toLocaleDateString()}</span>
                    </div>
                    <div className="flex items-center gap-2 text-brass/60">
                      <span className="w-1 h-1 bg-brass/30 rounded-full"></span>
                      <span>{c.bounty} SOL BOUNTY</span>
                    </div>
                    <a
                      href={`https://explorer.solana.com/address/${getCasePDA(Number(c.id)).toBase58()}?cluster=devnet`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-teal-muted hover:text-ivory transition-colors underline decoration-teal-muted/20 underline-offset-4"
                    >
                      EXPLORER ↗
                    </a>
                  </div>
                </div>
                <div className="text-brass font-serif italic text-[11px] uppercase tracking-[0.3em] opacity-0 -translate-x-4 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-500 whitespace-nowrap">
                  Enter Courtroom →
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
