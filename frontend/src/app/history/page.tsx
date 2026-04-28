"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { API_URL } from "@/lib/constants";
import { getCasePDA } from "@/lib/program";

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
    if (state === 3) {
      if (!hasFeedback) return <span className="badge-orange">FEEDBACK REQUIRED</span>;
      return <span className="badge-green">COMPLETED</span>;
    }
    if (state === 0) return <span className="badge-blue animate-pulse">OPEN</span>;
    return <span className="badge-gray">ARCHIVED</span>;
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-700">
      <div className="text-center space-y-2">
        <h1 className="text-4xl font-black uppercase neon-text">Protocol History</h1>
        <p className="text-gray-400 font-mono text-sm uppercase tracking-widest">Archive of your on-chain interactions</p>
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
        <div className="grid gap-4">
          {cases.map(c => (
            <div 
              key={c.id} 
              onClick={() => router.push(`/case/${c.id}`)}
              className="glass-panel p-6 flex justify-between items-center hover:border-[var(--color-primary)] transition-all group cursor-pointer"
            >
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-xs text-gray-600 font-mono">#{c.id}</span>
                  {getStateBadge(c.state, c.has_feedback)}
                  <span className="text-[10px] bg-white/5 text-gray-400 px-2 py-0.5 rounded uppercase font-bold tracking-tighter">
                    {c.topology === 1 ? "Generator-Validator" : "Linear Debate"}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-white group-hover:text-[var(--color-primary)] transition-colors leading-tight">
                  {c.task}
                </h3>
                <div className="text-[10px] text-gray-500 font-mono uppercase mt-2 flex items-center gap-4">
                  <span>{new Date(c.date * 1000).toLocaleDateString()}</span>
                  <span className="w-1 h-1 bg-gray-800 rounded-full"></span>
                  <span className="text-[var(--color-accent)]">{c.bounty} SOL BOUNTY</span>
                  <span className="w-1 h-1 bg-gray-800 rounded-full"></span>
                  <a 
                    href={`https://explorer.solana.com/address/${getCasePDA(Number(c.id)).toBase58()}?cluster=devnet`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-[var(--color-primary)] hover:underline opacity-60 hover:opacity-100"
                  >
                    EXPLORER ↗
                  </a>
                </div>
              </div>
              <div className="text-[var(--color-primary)] font-bold text-[10px] tracking-tighter opacity-0 group-hover:opacity-100 transition-all">
                RE-ENTER COURT ROOM →
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
