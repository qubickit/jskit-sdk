import { createAssetsHelpers } from "./assets.js";
import { createBobClient } from "./bob/client.js";
import { createContractHelpers } from "./contracts.js";
import type { FetchLike } from "./http.js";
import { createQbiHelpers, createQbiRegistry, type QbiCodecRegistry, type QbiFile } from "./qbi.js";
import { createRpcClient } from "./rpc/client.js";
import { createTickHelpers } from "./tick.js";
import { createTransactionHelpers } from "./transactions.js";
import { createTransferHelpers } from "./transfers.js";
import { createTxConfirmationHelpers } from "./tx/confirm.js";
import { createTxHelpers } from "./tx/tx.js";
import type { TxQueuePolicy } from "./tx/tx-queue.js";
import { TxQueue } from "./tx/tx-queue.js";
import type { SeedVault } from "./vault.js";

export type SdkConfig = Readonly<{
  /** Partner RPC base URL (recommended: `https://rpc.qubic.org`). */
  baseUrl?: string;
  /** Optional custom fetch implementation (for testing, instrumentation, etc). */
  fetch?: FetchLike;
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
  contracts?: Readonly<{
    defaultRetries?: number;
    defaultRetryDelayMs?: number;
  }>;
  assets?: Readonly<{
    requestAssets?: (request: Uint8Array, signal?: AbortSignal) => Promise<readonly Uint8Array[]>;
  }>;
  qbi?: Readonly<{
    files?: readonly QbiFile[];
    codecs?: QbiCodecRegistry;
  }>;
  vault?: SeedVault;
  bob?: Readonly<{
    baseUrl?: string;
    fetch?: FetchLike;
    headers?: Readonly<Record<string, string>>;
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
  const contracts = createContractHelpers({
    rpc,
    defaultRetries: config.contracts?.defaultRetries,
    defaultRetryDelayMs: config.contracts?.defaultRetryDelayMs,
  });

  const txQueue =
    config.txQueue?.enabled === false
      ? undefined
      : new TxQueue({
          policy: config.txQueue?.policy,
          confirm: ({ txId, targetTick, signal }) =>
            tx.waitForConfirmation({ txId, targetTick, signal }),
        });

  const transactions = createTransactionHelpers({ tick, tx, txQueue, vault: config.vault });
  const transfers = createTransferHelpers({ transactions });
  const assets = config.assets?.requestAssets
    ? createAssetsHelpers({ requestAssets: config.assets.requestAssets })
    : undefined;
  const qbi = config.qbi?.files
    ? config.qbi.codecs
      ? createQbiHelpers({
          contracts,
          registry: createQbiRegistry({ files: config.qbi.files }),
          transactions,
          codecs: config.qbi.codecs,
        })
      : createQbiHelpers({
          contracts,
          registry: createQbiRegistry({ files: config.qbi.files }),
          transactions,
        })
    : undefined;
  const bob = createBobClient({
    baseUrl: config.bob?.baseUrl,
    fetch: config.bob?.fetch ?? config.fetch,
    headers: config.bob?.headers,
  });
  const vault = config.vault;
  return {
    rpc,
    tick,
    tx,
    txQueue,
    transactions,
    transfers,
    contracts,
    assets,
    qbi,
    vault,
    bob,
  } as const;
}
