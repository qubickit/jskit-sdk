import type { RpcClient } from "./rpc/client.js";

export type ContractsHelpersConfig = Readonly<{
  rpc: RpcClient;
  defaultRetries?: number;
  defaultRetryDelayMs?: number;
}>;

export type QueryRawInput = Readonly<{
  contractIndex: bigint | number;
  inputType: bigint | number;
  inputBytes?: Uint8Array;
  inputBase64?: string;
  /** If provided, retries when response bytes are shorter than this value. */
  expectedOutputSize?: number;
  retries?: number;
  retryDelayMs?: number;
  signal?: AbortSignal;
}>;

export type QueryRawResult = Readonly<{
  responseBytes: Uint8Array;
  responseBase64: string;
  attempts: number;
}>;

export type ContractsHelpers = Readonly<{
  queryRaw(input: QueryRawInput): Promise<QueryRawResult>;
  querySmartContract(input: {
    contractIndex: bigint | number;
    inputType: bigint | number;
    input: Uint8Array | string;
  }): Promise<{ responseBytes: Uint8Array; responseBase64: string }>;
}>;

export class ContractQueryAbortedError extends Error {
  override name = "ContractQueryAbortedError";
}

export function createContractHelpers(config: ContractsHelpersConfig): ContractsHelpers {
  const defaultRetries = config.defaultRetries ?? 0;
  const defaultRetryDelayMs = config.defaultRetryDelayMs ?? 1_000;

  return {
    async querySmartContract(
      input,
    ): Promise<{ responseBytes: Uint8Array; responseBase64: string }> {
      return config.rpc.live.querySmartContract(input);
    },

    async queryRaw(input: QueryRawInput): Promise<QueryRawResult> {
      const retries = input.retries ?? defaultRetries;
      const retryDelayMs = input.retryDelayMs ?? defaultRetryDelayMs;
      const expectedOutputSize = input.expectedOutputSize;
      const inputBytes =
        input.inputBytes ?? (input.inputBase64 ? decodeBase64(input.inputBase64) : undefined);
      if (!inputBytes) {
        throw new TypeError("queryRaw requires inputBytes or inputBase64");
      }

      const controller = new AbortController();
      const signals: AbortSignal[] = [controller.signal];
      if (input.signal) signals.push(input.signal);
      const signal = anySignal(signals);

      let attempts = 0;
      while (true) {
        if (signal.aborted) throw new ContractQueryAbortedError("Contract query aborted");
        attempts++;

        const res = await config.rpc.live.querySmartContract({
          contractIndex: input.contractIndex,
          inputType: input.inputType,
          input: inputBytes,
        });

        const shortResponse =
          typeof expectedOutputSize === "number" &&
          Number.isFinite(expectedOutputSize) &&
          expectedOutputSize > 0 &&
          res.responseBytes.length < expectedOutputSize;

        if (!shortResponse || attempts > retries) {
          return { ...res, attempts };
        }

        await sleep(retryDelayMs, signal);
      }
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
      reject(new ContractQueryAbortedError("Contract query aborted"));
    };

    const cleanup = () => {
      clearTimeout(id);
      signal.removeEventListener("abort", onAbort);
    };

    signal.addEventListener("abort", onAbort, { once: true });
  });
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

function decodeBase64(value: string): Uint8Array {
  if (typeof atob === "function") {
    const bin = atob(value);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }
  throw new Error("Base64 decoding is not available in this runtime");
}
