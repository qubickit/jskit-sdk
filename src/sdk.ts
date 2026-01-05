import { createRpcClient } from "./rpc/client.js";
import { createTickHelpers } from "./tick.js";
import { createTransactionHelpers } from "./transactions.js";
import { createTransferHelpers } from "./transfers.js";
import { createTxConfirmationHelpers } from "./tx/confirm.js";
import { createTxHelpers } from "./tx/tx.js";
import type { TxQueuePolicy } from "./tx/tx-queue.js";
import { TxQueue } from "./tx/tx-queue.js";

export type SdkConfig = Readonly<{
  /** Partner RPC base URL (recommended: `https://rpc.qubic.org`). */
  baseUrl?: string;
  /** Optional custom fetch implementation (for testing, instrumentation, etc). */
  fetch?: typeof fetch;
  tick?: Readonly<{
    minOffset?: bigint | number;
    defaultOffset?: bigint | number;
    maxOffset?: bigint | number;
  }>;
  tx?: Readonly<{
    confirmTimeoutMs?: number;
    confirmPollIntervalMs?: number;
  }>;
  txQueue?: Readonly<{
    enabled?: boolean;
    policy?: TxQueuePolicy;
  }>;
}>;

export function createSdk(config: SdkConfig = {}) {
  const rpc = createRpcClient({ baseUrl: config.baseUrl, fetch: config.fetch });
  const tick = createTickHelpers({
    rpc,
    minOffset: config.tick?.minOffset,
    defaultOffset: config.tick?.defaultOffset,
    maxOffset: config.tick?.maxOffset,
  });

  const confirm = createTxConfirmationHelpers({
    rpc,
    defaultTimeoutMs: config.tx?.confirmTimeoutMs,
    defaultPollIntervalMs: config.tx?.confirmPollIntervalMs,
  });
  const tx = createTxHelpers({ rpc, confirm });

  const txQueue =
    config.txQueue?.enabled === false
      ? undefined
      : new TxQueue({
          policy: config.txQueue?.policy,
          confirm: ({ txId, targetTick, signal }) =>
            tx.waitForConfirmation({ txId, targetTick, signal }),
        });

  const transactions = createTransactionHelpers({ tick, tx, txQueue });
  const transfers = createTransferHelpers({ transactions });
  return { rpc, tick, tx, txQueue, transactions, transfers } as const;
}
