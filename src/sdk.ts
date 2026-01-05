import { createRpcClient } from "./rpc/client.js";
import { createTickHelpers } from "./tick.js";
import { createTransactionHelpers } from "./transactions.js";
import { createTransferHelpers } from "./transfers.js";
import { createTxHelpers } from "./tx/tx.js";
import { TxQueue } from "./tx/tx-queue.js";

export type SdkConfig = Readonly<{
  /** Partner RPC base URL (recommended: `https://rpc.qubic.org`). */
  baseUrl?: string;
  /** Optional custom fetch implementation (for testing, instrumentation, etc). */
  fetch?: typeof fetch;
}>;

export function createSdk(config: SdkConfig = {}) {
  const rpc = createRpcClient({ baseUrl: config.baseUrl, fetch: config.fetch });
  const tick = createTickHelpers({ rpc });
  const tx = createTxHelpers({ rpc });
  const txQueue = new TxQueue({
    confirm: ({ txId, targetTick, signal }) => tx.waitForConfirmation({ txId, targetTick, signal }),
  });
  const transactions = createTransactionHelpers({ tick, tx, txQueue });
  const transfers = createTransferHelpers({ transactions });
  return { rpc, tick, tx, txQueue, transactions, transfers } as const;
}
