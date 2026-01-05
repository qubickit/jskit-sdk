import {
  buildSignedTransaction,
  identityFromSeed,
  privateKeyFromSeed,
  publicKeyFromIdentity,
  publicKeyFromSeed,
  transactionId,
} from "@qubic-labs/core";
import type { BroadcastTransactionResult } from "./rpc/client.js";
import type { TickHelpers } from "./tick.js";
import type { TxHelpers } from "./tx/tx.js";
import type { TxQueue } from "./tx/tx-queue.js";

export type TransactionHelpersConfig = Readonly<{
  tick: TickHelpers;
  tx: TxHelpers;
  txQueue?: TxQueue;
}>;

export type BuildSignedTransactionInput = Readonly<{
  fromSeed: string;
  toIdentity: string;
  amount: bigint;
  targetTick?: bigint | number;
  inputType?: number;
  inputBytes?: Uint8Array;
}>;

export type BuiltTransaction = Readonly<{
  txBytes: Uint8Array;
  /** Deterministic transaction id derived from tx bytes. */
  txId: string;
  targetTick: bigint;
}>;

export type SendTransactionResult = Readonly<{
  txBytes: Uint8Array;
  /** Deterministic transaction id derived from tx bytes. */
  txId: string;
  /** Transaction id returned by the RPC broadcast call (used for confirmation). */
  networkTxId: string;
  targetTick: bigint;
  broadcast: BroadcastTransactionResult;
}>;

export class QueuedTransactionError extends Error {
  override name = "QueuedTransactionError";

  constructor(
    message: string,
    readonly details: Readonly<{
      status: string;
      error?: unknown;
    }>,
  ) {
    super(message);
  }
}

export type SendAndConfirmTransactionInput = BuildSignedTransactionInput &
  Readonly<{
    timeoutMs?: number;
    pollIntervalMs?: number;
    signal?: AbortSignal;
  }>;

export type TransactionHelpers = Readonly<{
  buildSigned(input: BuildSignedTransactionInput): Promise<BuiltTransaction>;
  send(input: BuildSignedTransactionInput): Promise<SendTransactionResult>;
  sendAndConfirm(input: SendAndConfirmTransactionInput): Promise<SendTransactionResult>;
  sendQueued(input: SendAndConfirmTransactionInput): Promise<SendTransactionResult>;
}>;

export function createTransactionHelpers(config: TransactionHelpersConfig): TransactionHelpers {
  const helpers: TransactionHelpers = {
    async buildSigned(input: BuildSignedTransactionInput): Promise<BuiltTransaction> {
      const targetTick =
        input.targetTick !== undefined
          ? toBigint(input.targetTick)
          : await config.tick.getSuggestedTargetTick();

      const tickU32 = toU32Number(targetTick, "targetTick");
      const sourcePublicKey32 = await publicKeyFromSeed(input.fromSeed);
      const destinationPublicKey32 = publicKeyFromIdentity(input.toIdentity);
      const secretKey32 = await privateKeyFromSeed(input.fromSeed);

      const txBytes = await buildSignedTransaction(
        {
          sourcePublicKey32,
          destinationPublicKey32,
          amount: input.amount,
          tick: tickU32,
          inputType: input.inputType ?? 0,
          inputBytes: input.inputBytes,
        },
        secretKey32,
      );
      const txId = await transactionId(txBytes);
      return { txBytes, txId, targetTick };
    },

    async send(input: BuildSignedTransactionInput): Promise<SendTransactionResult> {
      const built = await helpers.buildSigned(input);
      const broadcast = await config.tx.broadcastSigned(built.txBytes);
      return {
        ...built,
        networkTxId: broadcast.transactionId,
        broadcast,
      };
    },

    async sendAndConfirm(input: SendAndConfirmTransactionInput): Promise<SendTransactionResult> {
      if (config.txQueue) return helpers.sendQueued(input);

      const built = await helpers.buildSigned(input);
      const broadcast = await config.tx.broadcastSigned(built.txBytes);
      await config.tx.waitForConfirmation({
        txId: broadcast.transactionId,
        targetTick: built.targetTick,
        timeoutMs: input.timeoutMs,
        pollIntervalMs: input.pollIntervalMs,
        signal: input.signal,
      });
      return {
        ...built,
        networkTxId: broadcast.transactionId,
        broadcast,
      };
    },

    async sendQueued(input: SendAndConfirmTransactionInput): Promise<SendTransactionResult> {
      const txQueue = config.txQueue;
      if (!txQueue) throw new Error("Transaction queue is not configured");

      const sourceIdentity = await identityFromSeed(input.fromSeed);
      const built = await helpers.buildSigned(input);

      const queued = await txQueue.enqueue({
        sourceIdentity,
        targetTick: built.targetTick,
        submit: async ({ signal }) => {
          if (signal.aborted) throw new Error("aborted");
          const broadcast = await config.tx.broadcastSigned(built.txBytes);
          return { txId: broadcast.transactionId, result: broadcast };
        },
        confirm: ({ txId, targetTick, signal }) =>
          config.tx.waitForConfirmation({
            txId,
            targetTick,
            timeoutMs: input.timeoutMs,
            pollIntervalMs: input.pollIntervalMs,
            signal,
          }),
      });

      if (queued.status !== "confirmed") {
        throw new QueuedTransactionError("Transaction queue did not confirm", {
          status: queued.status,
          error: queued.error,
        });
      }
      const broadcast = queued.result as BroadcastTransactionResult | undefined;
      if (!broadcast) throw new Error("Transaction queue missing broadcast result");

      return {
        ...built,
        networkTxId: broadcast.transactionId,
        broadcast,
      };
    },
  };

  return helpers;
}

function toBigint(value: bigint | number): bigint {
  if (typeof value === "bigint") return value;
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new TypeError("Expected an integer");
  }
  return BigInt(value);
}

function toU32Number(value: bigint, name: string): number {
  if (value < 0n || value > 0xffff_ffffn) {
    throw new RangeError(`${name} must fit in uint32`);
  }
  return Number(value);
}
