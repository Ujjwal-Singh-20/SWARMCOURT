import { AnchorProvider, Program, Idl } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./constants";

// Using require to ensure synchronous load
let idl: any = null;
try {
  idl = require("./idl/swarmcourt.json");
} catch (err) {
  console.error("FAILED TO REQUIRE IDL:", err);
}

export function getProgram(provider: AnchorProvider): Program {
  if (!PROGRAM_ID) {
    throw new Error("PROGRAM_ID is not defined in constants.ts");
  }
  if (!idl) {
    throw new Error("IDL failed to load.");
  }

  try {
    const programId = new PublicKey(PROGRAM_ID);
    // Anchor <= 0.29.0 signature: new Program(idl, programId, provider)
    return new Program(idl as Idl, programId, provider);
  } catch (err) {
    console.error("CRITICAL: Error in new Program():", err);
    throw err;
  }
}

// --- PDA Helpers ---

export function getGlobalStatePDA(): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("global")],
    new PublicKey(PROGRAM_ID)
  );
  return pda;
}

export function getCasePDA(caseId: number): PublicKey {
  const buffer = Buffer.alloc(8);
  // Manual Little-Endian write for maximum compatibility
  let id = BigInt(caseId);
  for (let i = 0; i < 8; i++) {
    buffer[i] = Number(id & BigInt(0xff));
    id >>= BigInt(8);
  }
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("case"), buffer],
    new PublicKey(PROGRAM_ID)
  );
  console.log(`DEBUG: Case ID ${caseId} -> PDA ${pda.toBase58()} (Seeds: 'case' + ${buffer.toString('hex')})`);
  return pda;
}

export function getReputationPDA(agentPubkey: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("reputation"), agentPubkey.toBuffer()],
    new PublicKey(PROGRAM_ID)
  );
  return pda;
}
