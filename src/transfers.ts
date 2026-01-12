import type { BroadcastTransactionResult, QueryTransaction } from "./rpc/client.js";
import type { SeedSourceInput, TransactionHelpers } from "./transactions.js";

export type TransferHelpersConfig = Readonly<{
  transactions: TransactionHelpers;
}>;

export type BuildSignedTransferInput = SeedSourceInput &
  Readonly<{
    toIdentity: string;
    amount: bigint;
    targetTick?: bigint | number;
  }>;

export type SignedTransfer = Readonly<{
  txBytes: Uint8Array;
  txId: string;
  targetTick: bigint;
}>;

export type SendTransferResult = Readonly<{
  txBytes: Uint8Array;
  txId: string;
  networkTxId: string;
  targetTick: bigint;
  broadcast: BroadcastTransactionResult;
}>;

export type SendTransferReceipt = SendTransferResult &
  Readonly<{
    confirmedTransaction: QueryTransaction;
  }>;

export type SendAndConfirmInput = BuildSignedTransferInput &
  Readonly<{
    timeoutMs?: number;
    pollIntervalMs?: number;
    signal?: AbortSignal;
  }>;

export type TransferHelpers = Readonly<{
  buildSignedTransfer(input: BuildSignedTransferInput): Promise<SignedTransfer>;
  send(input: BuildSignedTransferInput): Promise<SendTransferResult>;
  sendAndConfirm(input: SendAndConfirmInput): Promise<SendTransferResult>;
  sendAndConfirmWithReceipt(input: SendAndConfirmInput): Promise<SendTransferReceipt>;
}>;

export function createTransferHelpers(config: TransferHelpersConfig): TransferHelpers {
  const helpers: TransferHelpers = {
    async buildSignedTransfer(input: BuildSignedTransferInput): Promise<SignedTransfer> {
      const built = await config.transactions.buildSigned({
        ...input,
        toIdentity: input.toIdentity,
        amount: input.amount,
        targetTick: input.targetTick,
      });
      return { txBytes: built.txBytes, txId: built.txId, targetTick: built.targetTick };
    },

    async send(input: BuildSignedTransferInput): Promise<SendTransferResult> {
      const sent = await config.transactions.send({
        ...input,
        toIdentity: input.toIdentity,
        amount: input.amount,
        targetTick: input.targetTick,
      });
      return {
        txBytes: sent.txBytes,
        txId: sent.txId,
        networkTxId: sent.networkTxId,
        targetTick: sent.targetTick,
        broadcast: sent.broadcast,
      };
    },

    async sendAndConfirm(input: SendAndConfirmInput): Promise<SendTransferResult> {
      const sent = await config.transactions.sendAndConfirm({
        ...input,
        toIdentity: input.toIdentity,
        amount: input.amount,
        targetTick: input.targetTick,
        timeoutMs: input.timeoutMs,
        pollIntervalMs: input.pollIntervalMs,
        signal: input.signal,
      });
      return {
        txBytes: sent.txBytes,
        txId: sent.txId,
        networkTxId: sent.networkTxId,
        targetTick: sent.targetTick,
        broadcast: sent.broadcast,
      };
    },

    async sendAndConfirmWithReceipt(input: SendAndConfirmInput): Promise<SendTransferReceipt> {
      const sent = await config.transactions.sendAndConfirmWithReceipt({
        ...input,
        toIdentity: input.toIdentity,
        amount: input.amount,
        targetTick: input.targetTick,
        timeoutMs: input.timeoutMs,
        pollIntervalMs: input.pollIntervalMs,
        signal: input.signal,
      });
      return {
        txBytes: sent.txBytes,
        txId: sent.txId,
        networkTxId: sent.networkTxId,
        targetTick: sent.targetTick,
        broadcast: sent.broadcast,
        confirmedTransaction: sent.confirmedTransaction,
      };
    },
  };

  return helpers;
}
