import {
  buildSignedTransaction,
  privateKeyFromSeed,
  publicKeyFromIdentity,
  publicKeyFromSeed,
  transactionId,
} from "@qubic-labs/core";
import type { BroadcastTransactionResult } from "./rpc/client.js";
import type { TickHelpers } from "./tick.js";
import type { TxHelpers } from "./tx/tx.js";

export type TransactionHelpersConfig = Readonly<{
  tick: TickHelpers;
  tx: TxHelpers;
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
  txId: string;
  targetTick: bigint;
}>;

export type SendTransactionResult = Readonly<{
  txBytes: Uint8Array;
  txId: string;
  targetTick: bigint;
  broadcast: BroadcastTransactionResult;
}>;

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
      return { ...built, broadcast };
    },

    async sendAndConfirm(input: SendAndConfirmTransactionInput): Promise<SendTransactionResult> {
      const built = await helpers.buildSigned(input);
      const broadcast = await config.tx.broadcastSigned(built.txBytes);
      await config.tx.waitForConfirmation({
        txId: built.txId,
        targetTick: built.targetTick,
        timeoutMs: input.timeoutMs,
        pollIntervalMs: input.pollIntervalMs,
        signal: input.signal,
      });
      return { ...built, broadcast };
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
