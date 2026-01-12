import { publicKeyFromIdentity, writeI64LE } from "@qubic-labs/core";
import { createSdk } from "../src/sdk.js";

const fromSeed = process.env.QUBIC_SEED;
const qutilIdentity = process.env.QUBIC_QUTIL_IDENTITY;
const rpcUrl = process.env.QUBIC_RPC_URL ?? "https://rpc.qubic.org";

if (!fromSeed) throw new Error("Missing env var: QUBIC_SEED");
if (!qutilIdentity) throw new Error("Missing env var: QUBIC_QUTIL_IDENTITY");

const transfers = [
  {
    toIdentity:
      process.env.QUBIC_TO_IDENTITY ??
      "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFXIB",
    amount: 1n,
  },
];

const inputBytes = buildSendManyPayload(transfers);

const sdk = createSdk({ baseUrl: rpcUrl });
const sent = await sdk.transactions.sendAndConfirm({
  fromSeed,
  toIdentity: qutilIdentity,
  amount: 0n,
  inputType: 1, // QUTIL SendToManyV1
  inputBytes,
});

console.log({
  txId: sent.txId,
  networkTxId: sent.networkTxId,
  targetTick: sent.targetTick.toString(),
});

type SendManyTransfer = Readonly<{ toIdentity: string; amount: bigint }>;

function buildSendManyPayload(transfers: readonly SendManyTransfer[]): Uint8Array {
  if (transfers.length > 25) throw new Error("SendMany supports up to 25 transfers");
  const payload = new Uint8Array(1000);

  for (let i = 0; i < 25; i++) {
    const transfer = transfers[i];
    if (transfer && transfer.amount > 0n) {
      const pubkey = publicKeyFromIdentity(transfer.toIdentity);
      payload.set(pubkey, i * 32);
      writeI64LE(transfer.amount, payload, 800 + i * 8);
    }
  }

  return payload;
}
