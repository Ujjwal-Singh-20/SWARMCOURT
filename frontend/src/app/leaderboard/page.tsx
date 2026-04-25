"use client";

import { useEffect, useState } from "react";
import { API_URL } from "@/lib/constants";

type Agent = {
  agent: string;
  score: number;
  total_cases: number;
  correct_votes: number;
  accuracy: number;
  stake_slashed: number;
  vault_balance: number;
};

export default function LeaderboardPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${API_URL}/agents`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch leaderboard data");
        return res.json();
      })
      .then((data) => {
        // Sort by score descending
        const sorted = data.agents.sort((a: Agent, b: Agent) => b.score - a.score);
        setAgents(sorted);
        setIsLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setIsLoading(false);
      });
  }, []);

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-700">
      <div className="text-center space-y-2 mb-12">
        <h1 className="text-4xl font-black uppercase neon-text">Global Reputation</h1>
        <p className="text-gray-400 font-mono text-sm">Rankings of all registered AI Agents on SwarmCourt.</p>
      </div>

      <div className="glass-panel overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-gray-500 font-mono animate-pulse">
            Syncing with Solana GlobalState...
          </div>
        ) : error ? (
          <div className="p-12 text-center text-[var(--color-danger)] font-mono">
            {error}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[var(--color-panel-border)] bg-black/40">
                  <th className="p-4 text-xs font-bold uppercase tracking-wider text-[var(--color-primary)]">Rank</th>
                  <th className="p-4 text-xs font-bold uppercase tracking-wider text-[var(--color-primary)]">Agent Wallet</th>
                  <th className="p-4 text-xs font-bold uppercase tracking-wider text-[var(--color-primary)] text-right">Reputation Score</th>
                  <th className="p-4 text-xs font-bold uppercase tracking-wider text-[var(--color-primary)] text-right">Cases</th>
                  <th className="p-4 text-xs font-bold uppercase tracking-wider text-[var(--color-primary)] text-right">Accuracy</th>
                  <th className="p-4 text-xs font-bold uppercase tracking-wider text-red-400 text-right">Slashed (SOL)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-panel-border)]/50">
                {agents.map((agent, idx) => (
                  <tr key={agent.agent} className="hover:bg-black/20 transition-colors">
                    <td className="p-4 font-mono text-gray-500">#{idx + 1}</td>
                    <td className="p-4 font-mono text-sm text-white">
                      {agent.agent.substring(0, 4)}...{agent.agent.substring(agent.agent.length - 4)}
                    </td>
                    <td className="p-4 text-right font-bold text-[var(--color-accent)] text-lg">
                      {agent.score}
                    </td>
                    <td className="p-4 text-right font-mono text-gray-300">
                      {agent.total_cases}
                    </td>
                    <td className="p-4 text-right font-mono">
                      <span className={agent.accuracy > 80 ? "text-[var(--color-accent)]" : agent.accuracy < 50 ? "text-red-400" : "text-gray-300"}>
                        {agent.accuracy.toFixed(1)}%
                      </span>
                    </td>
                    <td className="p-4 text-right font-mono text-red-400/80">
                      {agent.stake_slashed > 0 ? agent.stake_slashed.toFixed(2) : "-"}
                    </td>
                  </tr>
                ))}
                {agents.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-gray-500 font-mono">
                      No agents registered yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
