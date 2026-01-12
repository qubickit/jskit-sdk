import { identityFromPublicKey } from "@qubic-labs/core";
import type { ContractsHelpers, QueryRawResult } from "./contracts.js";
import type {
  BuiltTransaction,
  SendAndConfirmTransactionInput,
  SendTransactionReceipt,
  SendTransactionResult,
  TransactionHelpers,
} from "./transactions.js";

export type QbiEntry = Readonly<{
  kind: "function" | "procedure";
  name: string;
  inputType: number;
  inputSize?: number;
  outputSize?: number;
}>;

export type QbiFile = Readonly<{
  qbiVersion?: string;
  contract: Readonly<{
    name: string;
    contractIndex?: number;
    contractPublicKeyHex?: string;
    contractId?: string;
  }>;
  entries: readonly QbiEntry[];
}>;

export type QbiRegistry = Readonly<{
  byName: ReadonlyMap<string, QbiFile>;
  byIndex: ReadonlyMap<number, QbiFile>;
}>;

export type QbiRegistryInput = Readonly<{
  files: readonly QbiFile[];
}>;

export type QbiQueryInput = Readonly<{
  inputBytes?: Uint8Array;
  inputValue?: unknown;
  codec?: QbiCodec;
  expectedOutputSize?: number;
  retries?: number;
  retryDelayMs?: number;
  signal?: AbortSignal;
  allowSizeMismatch?: boolean;
}>;

export type QbiHelpersConfig = Readonly<{
  contracts: ContractsHelpers;
  registry: QbiRegistry;
  transactions?: TransactionHelpers;
}>;

export type QbiContractHandle = Readonly<{
  contract: QbiFile["contract"];
  getEntry(kind: QbiEntry["kind"], name: string): QbiEntry;
  query(name: string, input: QbiQueryInput): Promise<QueryRawResult>;
  decodeOutput(name: string, outputBytes: Uint8Array, codec: QbiCodec): unknown;
  prepareProcedure(
    name: string,
    inputBytes: Uint8Array,
  ): Readonly<{
    contractIndex: number;
    inputType: number;
    inputBytes: Uint8Array;
  }>;
  buildProcedureTransaction(input: QbiProcedureTxInput): Promise<BuiltTransaction>;
  sendProcedure(input: QbiProcedureTxInput): Promise<SendTransactionResult>;
  sendProcedureAndConfirm(
    input: QbiProcedureTxInput & SendAndConfirmTransactionInput,
  ): Promise<SendTransactionResult>;
  sendProcedureAndConfirmWithReceipt(
    input: QbiProcedureTxInput & SendAndConfirmTransactionInput,
  ): Promise<SendTransactionReceipt>;
}>;

export type QbiHelpers = Readonly<{
  contract(nameOrIndex: string | number): QbiContractHandle;
  hasContract(nameOrIndex: string | number): boolean;
}>;

export type QbiCodec = Readonly<{
  encode(entry: QbiEntry, value: unknown): Uint8Array;
  decode(entry: QbiEntry, bytes: Uint8Array): unknown;
}>;

export type QbiProcedureTxInput = Readonly<{
  name: string;
  fromSeed: string;
  amount?: bigint;
  targetTick?: bigint | number;
  inputBytes?: Uint8Array;
  inputValue?: unknown;
  codec?: QbiCodec;
}>;

export function createQbiRegistry(input: QbiRegistryInput): QbiRegistry {
  const byName = new Map<string, QbiFile>();
  const byIndex = new Map<number, QbiFile>();

  for (const file of input.files) {
    byName.set(file.contract.name, file);
    if (typeof file.contract.contractIndex === "number") {
      byIndex.set(file.contract.contractIndex, file);
    }
  }

  return { byName, byIndex };
}

export function createQbiHelpers(config: QbiHelpersConfig): QbiHelpers {
  const { contracts, registry } = config;

  const getContract = (nameOrIndex: string | number): QbiFile => {
    const file =
      typeof nameOrIndex === "number"
        ? registry.byIndex.get(nameOrIndex)
        : registry.byName.get(nameOrIndex);
    if (!file) {
      throw new Error(`Unknown contract: ${String(nameOrIndex)}`);
    }
    return file;
  };

  const toHandle = (file: QbiFile): QbiContractHandle => {
    const findEntry = (kind: QbiEntry["kind"], name: string): QbiEntry => {
      const entry = file.entries.find((e) => e.kind === kind && e.name === name);
      if (!entry) throw new Error(`Unknown ${kind}: ${file.contract.name}.${name}`);
      return entry;
    };

    const getProcedureInputBytes = (entry: QbiEntry, input: QbiQueryInput): Uint8Array => {
      if (input.inputBytes) return input.inputBytes;
      if (input.inputValue !== undefined) {
        if (!input.codec) throw new Error("QBI codec is required for inputValue");
        return input.codec.encode(entry, input.inputValue);
      }
      throw new Error("QBI inputBytes or inputValue is required");
    };

    const getContractIdentity = (): string => {
      if (file.contract.contractId) return file.contract.contractId;
      if (file.contract.contractPublicKeyHex) {
        const pubkey = hexToBytes(file.contract.contractPublicKeyHex);
        if (pubkey.byteLength !== 32) {
          throw new Error(`contractPublicKeyHex must be 32 bytes for ${file.contract.name}`);
        }
        return identityFromPublicKey(pubkey);
      }
      throw new Error(`Contract identity not available for ${file.contract.name}`);
    };

    return {
      contract: file.contract,
      getEntry: findEntry,
      async query(name: string, input: QbiQueryInput): Promise<QueryRawResult> {
        const entry = findEntry("function", name);
        if (!file.contract.contractIndex && file.contract.contractIndex !== 0) {
          throw new Error(`Contract index missing for ${file.contract.name}`);
        }

        const inputBytes = getProcedureInputBytes(entry, input);
        if (
          entry.inputSize !== undefined &&
          entry.inputSize !== inputBytes.byteLength &&
          !input.allowSizeMismatch
        ) {
          throw new RangeError(
            `Input size mismatch: expected ${entry.inputSize}, got ${inputBytes.byteLength}`,
          );
        }

        return contracts.queryRaw({
          contractIndex: file.contract.contractIndex,
          inputType: entry.inputType,
          inputBytes,
          expectedOutputSize: input.expectedOutputSize ?? entry.outputSize,
          retries: input.retries,
          retryDelayMs: input.retryDelayMs,
          signal: input.signal,
        });
      },
      decodeOutput(name: string, outputBytes: Uint8Array, codec: QbiCodec): unknown {
        const entry = findEntry("function", name);
        return codec.decode(entry, outputBytes);
      },
      prepareProcedure(name: string, inputBytes: Uint8Array) {
        const entry = findEntry("procedure", name);
        if (!file.contract.contractIndex && file.contract.contractIndex !== 0) {
          throw new Error(`Contract index missing for ${file.contract.name}`);
        }
        if (entry.inputSize !== undefined && entry.inputSize !== inputBytes.byteLength) {
          throw new RangeError(
            `Input size mismatch: expected ${entry.inputSize}, got ${inputBytes.byteLength}`,
          );
        }
        return {
          contractIndex: file.contract.contractIndex,
          inputType: entry.inputType,
          inputBytes,
        };
      },
      async buildProcedureTransaction(input: QbiProcedureTxInput): Promise<BuiltTransaction> {
        if (!config.transactions) throw new Error("QBI transactions helper is not configured");
        const entry = findEntry("procedure", input.name);
        const inputBytes = getProcedureInputBytes(entry, {
          inputBytes: input.inputBytes,
          inputValue: input.inputValue,
          codec: input.codec,
        });
        const toIdentity = getContractIdentity();
        return config.transactions.buildSigned({
          fromSeed: input.fromSeed,
          toIdentity,
          amount: input.amount ?? 0n,
          targetTick: input.targetTick,
          inputType: entry.inputType,
          inputBytes,
        });
      },
      async sendProcedure(input: QbiProcedureTxInput): Promise<SendTransactionResult> {
        if (!config.transactions) throw new Error("QBI transactions helper is not configured");
        const entry = findEntry("procedure", input.name);
        const inputBytes = getProcedureInputBytes(entry, {
          inputBytes: input.inputBytes,
          inputValue: input.inputValue,
          codec: input.codec,
        });
        const toIdentity = getContractIdentity();
        return config.transactions.send({
          fromSeed: input.fromSeed,
          toIdentity,
          amount: input.amount ?? 0n,
          targetTick: input.targetTick,
          inputType: entry.inputType,
          inputBytes,
        });
      },
      async sendProcedureAndConfirm(
        input: QbiProcedureTxInput & SendAndConfirmTransactionInput,
      ): Promise<SendTransactionResult> {
        if (!config.transactions) throw new Error("QBI transactions helper is not configured");
        const entry = findEntry("procedure", input.name);
        const inputBytes = getProcedureInputBytes(entry, {
          inputBytes: input.inputBytes,
          inputValue: input.inputValue,
          codec: input.codec,
        });
        const toIdentity = getContractIdentity();
        return config.transactions.sendAndConfirm({
          fromSeed: input.fromSeed,
          toIdentity,
          amount: input.amount ?? 0n,
          targetTick: input.targetTick,
          inputType: entry.inputType,
          inputBytes,
          timeoutMs: input.timeoutMs,
          pollIntervalMs: input.pollIntervalMs,
          signal: input.signal,
        });
      },
      async sendProcedureAndConfirmWithReceipt(
        input: QbiProcedureTxInput & SendAndConfirmTransactionInput,
      ): Promise<SendTransactionReceipt> {
        if (!config.transactions) throw new Error("QBI transactions helper is not configured");
        const entry = findEntry("procedure", input.name);
        const inputBytes = getProcedureInputBytes(entry, {
          inputBytes: input.inputBytes,
          inputValue: input.inputValue,
          codec: input.codec,
        });
        const toIdentity = getContractIdentity();
        return config.transactions.sendAndConfirmWithReceipt({
          fromSeed: input.fromSeed,
          toIdentity,
          amount: input.amount ?? 0n,
          targetTick: input.targetTick,
          inputType: entry.inputType,
          inputBytes,
          timeoutMs: input.timeoutMs,
          pollIntervalMs: input.pollIntervalMs,
          signal: input.signal,
        });
      },
    };
  };

  return {
    contract(nameOrIndex: string | number): QbiContractHandle {
      return toHandle(getContract(nameOrIndex));
    },
    hasContract(nameOrIndex: string | number): boolean {
      return typeof nameOrIndex === "number"
        ? registry.byIndex.has(nameOrIndex)
        : registry.byName.has(nameOrIndex);
    },
  };
}

function hexToBytes(hex: string): Uint8Array {
  const cleaned = hex.startsWith("0x") || hex.startsWith("0X") ? hex.slice(2) : hex;
  if (cleaned.length % 2 !== 0) throw new Error("hex string must have even length");
  const bytes = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    const start = i * 2;
    bytes[i] = Number.parseInt(cleaned.slice(start, start + 2), 16);
  }
  return bytes;
}
