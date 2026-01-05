import { createSdk } from "../src/sdk.js";

const fromSeed = process.env.QUBIC_SEED;
const toIdentity = process.env.QUBIC_TO_IDENTITY;

if (!fromSeed) throw new Error("Missing env var: QUBIC_SEED");
if (!toIdentity) throw new Error("Missing env var: QUBIC_TO_IDENTITY");

const sdk = createSdk({
  baseUrl: process.env.QUBIC_RPC_URL ?? "https://rpc.qubic.org",
});

const receipt = await sdk.transfers.sendAndConfirmWithReceipt({
  fromSeed,
  toIdentity,
  amount: 1n,
});

console.log({
  txId: receipt.txId,
  networkTxId: receipt.networkTxId,
  targetTick: receipt.targetTick.toString(),
  confirmedTick: receipt.confirmedTransaction.tickNumber.toString(),
});
