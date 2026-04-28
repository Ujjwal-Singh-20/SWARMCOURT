"use client";

import { useEffect, useState } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { AnchorProvider } from "@coral-xyz/anchor";
import { getProgram } from "@/lib/program";
import { ADMIN_WALLET } from "@/lib/constants";
import { useRouter } from "next/navigation";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

export default function AdminDashboardPage() {
  const { publicKey, connected, wallet } = useWallet();
  const { connection } = useConnection();
  const router = useRouter();

  const [isLoading, setIsLoading] = useState(true);
  const [metrics, setMetrics] = useState({
    totalUsers: 0,
    totalCases: 0,
    totalAgents: 0,
    totalBountyVolume: 0,
  });
  const [recentCases, setRecentCases] = useState<any[]>([]);

  useEffect(() => {
    if (!connected || !publicKey) return;
    fetchMetrics();
  }, [connected, publicKey]);

  const fetchMetrics = async () => {
    setIsLoading(true);
    try {
      const provider = new AnchorProvider(connection, wallet?.adapter as any, { commitment: "confirmed" });
      const program = getProgram(provider);

      // Fetch all cases and agents directly from on-chain state
      const [allCases, allAgents] = await Promise.all([
        program.account.case.all(),
        program.account.agentReputation.all()
      ]);

      // Calculate Metrics
      const uniqueUsers = new Set(allCases.map((c: any) => c.account.creator.toBase58()));
      const totalBountyVolume = allCases.reduce((sum: number, c: any) => sum + (c.account.bounty.toNumber() / LAMPORTS_PER_SOL), 0);

      setMetrics({
        totalUsers: uniqueUsers.size,
        totalCases: allCases.length,
        totalAgents: allAgents.length,
        totalBountyVolume: totalBountyVolume,
      });

      // Sort recent cases
      const sortedCases = allCases
        .sort((a: any, b: any) => b.account.caseId.toNumber() - a.account.caseId.toNumber())
        .slice(0, 20);

      setRecentCases(sortedCases);
    } catch (err) {
      console.error("Failed to fetch admin metrics:", err);
    } finally {
      setIsLoading(false);
    }
  };

  if (!connected) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center animate-in fade-in duration-700">
        <div className="glass-panel p-12 text-center max-w-md w-full">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-[var(--color-primary)]/10 border-2 border-[var(--color-primary)] flex items-center justify-center">
            <span className="text-3xl">🔗</span>
          </div>
          <h1 className="text-2xl font-black uppercase tracking-widest text-[var(--color-primary)] mb-2">Connect Wallet</h1>
          <p className="text-gray-400 font-mono text-sm leading-relaxed mb-8">
            Please connect your wallet to view live protocol traction metrics.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-700">
      <div className="text-center space-y-2 mb-12">
        <h1 className="text-4xl font-black uppercase neon-text">Protocol Telemetry</h1>
        <p className="text-gray-400 font-mono text-sm">Decentralized Network Status</p>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <div className="w-16 h-16 rounded-full bg-[var(--color-primary)]/10 border-2 border-[var(--color-primary)] animate-spin"></div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Metric Cards */}
            <div className="glass-panel p-6 border-t-2 border-[var(--color-primary)]">
              <div className="text-[10px] font-bold uppercase text-gray-500 tracking-widest mb-2">Total Creators</div>
              <div className="text-4xl font-black text-white">{metrics.totalUsers}</div>
            </div>

            <div className="glass-panel p-6 border-t-2 border-purple-500">
              <div className="text-[10px] font-bold uppercase text-gray-500 tracking-widest mb-2">Cases Orchestrated</div>
              <div className="text-4xl font-black text-white">{metrics.totalCases}</div>
            </div>

            <div className="glass-panel p-6 border-t-2 border-green-500">
              <div className="text-[10px] font-bold uppercase text-gray-500 tracking-widest mb-2">Active AI Nodes</div>
              <div className="text-4xl font-black text-white">{metrics.totalAgents}</div>
            </div>

            <div className="glass-panel p-6 border-t-2 border-[var(--color-accent)]">
              <div className="text-[10px] font-bold uppercase text-gray-500 tracking-widest mb-2">Total Bounty Vol.</div>
              <div className="text-4xl font-black text-[var(--color-accent)]">{metrics.totalBountyVolume.toFixed(2)} SOL</div>
            </div>
          </div>

          <div className="glass-panel p-8 mt-12">
            <h2 className="text-xl font-black uppercase tracking-widest mb-6">Recent Network Activity</h2>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-white/10 text-[10px] font-mono text-gray-500 uppercase tracking-widest">
                    <th className="pb-4">Case ID</th>
                    <th className="pb-4">Creator Wallet</th>
                    <th className="pb-4">Status</th>
                    <th className="pb-4">Bounty</th>
                    <th className="pb-4">Task Length</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {recentCases.map((c: any) => {
                    const statusText = ["Open", "Active", "Voting", "Completed"][c.account.state] || "Unknown";
                    const statusColor = [
                      "text-cyan-500",
                      "text-yellow-500",
                      "text-purple-500",
                      "text-green-500"
                    ][c.account.state] || "text-gray-500";

                    return (
                      <tr key={c.account.caseId.toString()} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                        <td className="py-4 font-mono">
                          <a 
                            href={`https://explorer.solana.com/address/${c.publicKey.toBase58()}?cluster=devnet`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-[var(--color-primary)] transition-colors underline decoration-dotted"
                          >
                            #{c.account.caseId.toString()}
                          </a>
                        </td>
                        <td className="py-4 font-mono text-gray-400">
                          <a 
                            href={`https://explorer.solana.com/address/${c.account.creator.toBase58()}?cluster=devnet`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-[var(--color-primary)] transition-colors"
                          >
                            {c.account.creator.toBase58().substring(0, 4)}...{c.account.creator.toBase58().slice(-4)}
                          </a>
                        </td>
                        <td className={`py-4 font-black uppercase text-[10px] tracking-widest ${statusColor}`}>
                          {statusText}
                        </td>
                        <td className="py-4 text-[var(--color-accent)] font-mono">
                          {(c.account.bounty.toNumber() / LAMPORTS_PER_SOL).toFixed(2)} SOL
                        </td>
                        <td className="py-4 text-gray-500 font-mono text-xs">
                          {c.account.task.length} chars
                        </td>
                      </tr>
                    );
                  })}
                  {recentCases.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-gray-500 font-mono text-xs italic">
                        No cases found on-chain.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <p className="text-[9px] text-gray-600 mt-6 text-center font-mono uppercase">
              * Showing only the last 20 cases drafted.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
