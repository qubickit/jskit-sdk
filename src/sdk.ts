import { createRpcClient } from "./rpc/client.js";
import { createTickHelpers } from "./tick.js";
import { createTxHelpers } from "./tx/tx.js";

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
  return { rpc, tick, tx } as const;
}
