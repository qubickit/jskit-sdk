import type { QueryTransaction, RpcClient } from "../rpc/client.js";
import { RpcError } from "../rpc/client.js";

export type WaitForConfirmationInput = Readonly<{
  txId: string;
  targetTick: bigint | number;
  timeoutMs?: number;
  pollIntervalMs?: number;
  signal?: AbortSignal;
}>;

export class TxConfirmationTimeoutError extends Error {
  override name = "TxConfirmationTimeoutError";
}

export class TxNotFoundError extends Error {
  override name = "TxNotFoundError";
}

export class TxConfirmationAbortedError extends Error {
  override name = "TxConfirmationAbortedError";
}

export type TxConfirmationHelpersConfig = Readonly<{
  rpc: RpcClient;
  defaultTimeoutMs?: number;
  defaultPollIntervalMs?: number;
}>;

export type TxConfirmationHelpers = Readonly<{
  waitForConfirmation(input: WaitForConfirmationInput): Promise<void>;
  waitForConfirmedTransaction(input: WaitForConfirmationInput): Promise<QueryTransaction>;
}>;

export function createTxConfirmationHelpers(
  config: TxConfirmationHelpersConfig,
): TxConfirmationHelpers {
  const defaultTimeoutMs = config.defaultTimeoutMs ?? 60_000;
  const defaultPollIntervalMs = config.defaultPollIntervalMs ?? 1_000;

  const waitForConfirmedTransaction = async (
    input: WaitForConfirmationInput,
  ): Promise<QueryTransaction> => {
    const start = Date.now();
    const timeoutMs = input.timeoutMs ?? defaultTimeoutMs;
    const pollIntervalMs = input.pollIntervalMs ?? defaultPollIntervalMs;
    const targetTick = toBigint(input.targetTick);
    let reachedTargetTick = false;
    let sawNotFoundAfterTarget = false;

    const controller = new AbortController();
    const signals: AbortSignal[] = [controller.signal];
    if (input.signal) signals.push(input.signal);
    const signal = anySignal(signals);

    if (signal.aborted) throw new TxConfirmationAbortedError("Confirmation aborted");

    while (true) {
      if (signal.aborted) throw new TxConfirmationAbortedError("Confirmation aborted");
      if (Date.now() - start > timeoutMs) {
        if (reachedTargetTick && sawNotFoundAfterTarget) {
          throw new TxNotFoundError(
            `Transaction ${input.txId} not found after target tick ${targetTick}`,
          );
        }
        throw new TxConfirmationTimeoutError(
          `Timed out waiting for confirmation of ${input.txId} (target tick ${targetTick})`,
        );
      }

      const lastProcessed = await config.rpc.query.getLastProcessedTick();
      if (lastProcessed.tickNumber < targetTick) {
        await sleep(pollIntervalMs, signal);
        continue;
      }
      reachedTargetTick = true;

      try {
        return await config.rpc.query.getTransactionByHash(input.txId);
      } catch (err) {
        if (err instanceof RpcError && err.details.status === 404) {
          sawNotFoundAfterTarget = true;
          await sleep(pollIntervalMs, signal);
          continue;
        }
        throw err;
      }
    }
  };

  return {
    async waitForConfirmation(input: WaitForConfirmationInput): Promise<void> {
      await waitForConfirmedTransaction(input);
    },

    async waitForConfirmedTransaction(input: WaitForConfirmationInput): Promise<QueryTransaction> {
      return waitForConfirmedTransaction(input);
    },
  };
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);

    const onAbort = () => {
      cleanup();
      reject(new TxConfirmationAbortedError("Confirmation aborted"));
    };

    const cleanup = () => {
      clearTimeout(id);
      signal.removeEventListener("abort", onAbort);
    };

    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function toBigint(value: bigint | number): bigint {
  if (typeof value === "bigint") return value;
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new TypeError("Expected an integer");
  }
  return BigInt(value);
}

function anySignal(signals: readonly AbortSignal[]): AbortSignal {
  if (signals.length === 0) return new AbortController().signal;
  if (signals.length === 1) {
    const only = signals[0];
    if (!only) return new AbortController().signal;
    return only;
  }

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  for (const s of signals) {
    if (s.aborted) return s;
    s.addEventListener("abort", onAbort, { once: true });
  }
  return controller.signal;
}
