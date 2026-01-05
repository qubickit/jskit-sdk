import type { BroadcastTransactionResult, QueryTransaction, RpcClient } from "../rpc/client.js";
import type { TxConfirmationHelpers, WaitForConfirmationInput } from "./confirm.js";
import { createTxConfirmationHelpers } from "./confirm.js";

export type TxHelpersConfig = Readonly<{
  rpc: RpcClient;
  confirm?: TxConfirmationHelpers;
}>;

export type TxHelpers = Readonly<{
  broadcastSigned(txBytes: Uint8Array | string): Promise<BroadcastTransactionResult>;
  waitForConfirmation(input: WaitForConfirmationInput): Promise<void>;
  waitForConfirmedTransaction(input: WaitForConfirmationInput): Promise<QueryTransaction>;
}>;

export function createTxHelpers(config: TxHelpersConfig): TxHelpers {
  const confirm =
    config.confirm ??
    createTxConfirmationHelpers({
      rpc: config.rpc,
    });

  return {
    async broadcastSigned(txBytes: Uint8Array | string): Promise<BroadcastTransactionResult> {
      return config.rpc.live.broadcastTransaction(txBytes);
    },

    async waitForConfirmation(input: WaitForConfirmationInput): Promise<void> {
      return confirm.waitForConfirmation(input);
    },

    async waitForConfirmedTransaction(input: WaitForConfirmationInput): Promise<QueryTransaction> {
      return confirm.waitForConfirmedTransaction(input);
    },
  };
}
