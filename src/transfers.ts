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

export type TransferHelpersConfig = Readonly<{
  tick: TickHelpers;
  tx: TxHelpers;
}>;

export type BuildSignedTransferInput = Readonly<{
  fromSeed: string;
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
  targetTick: bigint;
  broadcast: BroadcastTransactionResult;
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
}>;

export function createTransferHelpers(config: TransferHelpersConfig): TransferHelpers {
  const helpers: TransferHelpers = {
    async buildSignedTransfer(input: BuildSignedTransferInput): Promise<SignedTransfer> {
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
        },
        secretKey32,
      );
      const txId = await transactionId(txBytes);
      return { txBytes, txId, targetTick };
    },

    async send(input: BuildSignedTransferInput): Promise<SendTransferResult> {
      const built = await helpers.buildSignedTransfer(input);
      const broadcast = await config.tx.broadcastSigned(built.txBytes);
      return { ...built, broadcast };
    },

    async sendAndConfirm(input: SendAndConfirmInput): Promise<SendTransferResult> {
      const built = await helpers.buildSignedTransfer(input);
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
