export const RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com";
export const PROGRAM_ID = process.env.NEXT_PUBLIC_PROGRAM_ID || "9tMjJZB4DCJABpxYFJUi6VRSU1MZB2L5uf145f6AJytz";
export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
export const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000";

// The wallet address that receives the 5% protocol fee
export const ADMIN_WALLET = process.env.NEXT_PUBLIC_ADMIN_WALLET || "";

export const JURY_TIERS = [
  { id: 0, label: "Circuit Court", agents: 3, bounty: 0.02, minRep: 90 },
  { id: 1, label: "Appellate Court", agents: 5, bounty: 0.05, minRep: 111 },
  { id: 2, label: "Supreme Court", agents: 7, bounty: 0.10, minRep: 126 },
];

export const TOPOLOGIES = [
  { id: 0, label: "Debate", description: "3-7 agents argue A vs B. Best for reasoning." },
  { id: 1, label: "Generator-Validator", description: "1 creator + N reviewers. Best for code/content." },
];
