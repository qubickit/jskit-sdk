import type { ContractsHelpers, QueryRawResult } from "./contracts.js";

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
  inputBytes: Uint8Array;
  expectedOutputSize?: number;
  retries?: number;
  retryDelayMs?: number;
  signal?: AbortSignal;
  allowSizeMismatch?: boolean;
}>;

export type QbiHelpersConfig = Readonly<{
  contracts: ContractsHelpers;
  registry: QbiRegistry;
}>;

export type QbiContractHandle = Readonly<{
  contract: QbiFile["contract"];
  getEntry(kind: QbiEntry["kind"], name: string): QbiEntry;
  query(name: string, input: QbiQueryInput): Promise<QueryRawResult>;
  prepareProcedure(
    name: string,
    inputBytes: Uint8Array,
  ): Readonly<{
    contractIndex: number;
    inputType: number;
    inputBytes: Uint8Array;
  }>;
}>;

export type QbiHelpers = Readonly<{
  contract(nameOrIndex: string | number): QbiContractHandle;
  hasContract(nameOrIndex: string | number): boolean;
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

    return {
      contract: file.contract,
      getEntry: findEntry,
      async query(name: string, input: QbiQueryInput): Promise<QueryRawResult> {
        const entry = findEntry("function", name);
        if (!file.contract.contractIndex && file.contract.contractIndex !== 0) {
          throw new Error(`Contract index missing for ${file.contract.name}`);
        }

        if (
          entry.inputSize !== undefined &&
          entry.inputSize !== input.inputBytes.byteLength &&
          !input.allowSizeMismatch
        ) {
          throw new RangeError(
            `Input size mismatch: expected ${entry.inputSize}, got ${input.inputBytes.byteLength}`,
          );
        }

        return contracts.queryRaw({
          contractIndex: file.contract.contractIndex,
          inputType: entry.inputType,
          inputBytes: input.inputBytes,
          expectedOutputSize: input.expectedOutputSize ?? entry.outputSize,
          retries: input.retries,
          retryDelayMs: input.retryDelayMs,
          signal: input.signal,
        });
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
