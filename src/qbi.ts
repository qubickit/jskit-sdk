import { identityFromPublicKey } from "@qubic-labs/core";
import type { ContractsHelpers, QueryRawResult } from "./contracts.js";
import type {
  BuiltTransaction,
  SeedSourceInput,
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

export type QbiCodec<Input = unknown, Output = unknown> = Readonly<{
  encode(entry: QbiEntry, value: Input): Uint8Array;
  decode(entry: QbiEntry, bytes: Uint8Array): Output;
}>;

type QbiCodecLike = Readonly<{
  encode(entry: QbiEntry, value: unknown): Uint8Array;
  decode(entry: QbiEntry, bytes: Uint8Array): unknown;
}>;

export type QbiContractCodecs = Readonly<{
  functions?: Readonly<Record<string, QbiCodecLike>>;
  procedures?: Readonly<Record<string, QbiCodecLike>>;
}>;

export type QbiCodecRegistry = Readonly<Record<string, QbiContractCodecs>>;

type QbiFunctionCodecs<C> = C extends { functions?: infer F } ? F : undefined;
type QbiProcedureCodecs<C> = C extends { procedures?: infer P } ? P : undefined;
type QbiCodecInput<T> = T extends { encode(entry: QbiEntry, value: infer Input): Uint8Array }
  ? Input
  : unknown;
type QbiCodecOutput<T> = T extends { decode(entry: QbiEntry, bytes: Uint8Array): infer Output }
  ? Output
  : unknown;

type QbiFunctionInput<C, Name extends string> = QbiFunctionCodecs<C> extends Record<string, unknown>
  ? Name extends keyof QbiFunctionCodecs<C>
    ? QbiCodecInput<QbiFunctionCodecs<C>[Name]>
    : unknown
  : unknown;

type QbiFunctionOutput<C, Name extends string> = QbiFunctionCodecs<C> extends Record<
  string,
  unknown
>
  ? Name extends keyof QbiFunctionCodecs<C>
    ? QbiCodecOutput<QbiFunctionCodecs<C>[Name]>
    : unknown
  : unknown;

type QbiProcedureInput<C, Name extends string> = QbiProcedureCodecs<C> extends Record<
  string,
  unknown
>
  ? Name extends keyof QbiProcedureCodecs<C>
    ? QbiCodecInput<QbiProcedureCodecs<C>[Name]>
    : unknown
  : unknown;

export type QbiQueryInput<Input = unknown, Output = unknown> = Readonly<{
  inputBytes?: Uint8Array;
  inputValue?: Input;
  codec?: QbiCodec<Input, Output>;
  expectedOutputSize?: number;
  retries?: number;
  retryDelayMs?: number;
  signal?: AbortSignal;
  allowSizeMismatch?: boolean;
}>;

export type QbiQueryResult<Output = unknown> = QueryRawResult & Readonly<{ decoded?: Output }>;

export class QbiError extends Error {
  override name = "QbiError";
}

export class QbiCodecError extends QbiError {
  override name = "QbiCodecError";
}

export class QbiCodecMissingError extends QbiCodecError {
  constructor(message: string) {
    super(message);
    this.name = "QbiCodecMissingError";
  }
}

export class QbiCodecValidationError extends QbiCodecError {
  constructor(message: string) {
    super(message);
    this.name = "QbiCodecValidationError";
  }
}

export class QbiEntryNotFoundError extends QbiError {
  constructor(message: string) {
    super(message);
    this.name = "QbiEntryNotFoundError";
  }
}

export type QbiHelpersConfig<TCodecs extends QbiCodecRegistry | undefined = undefined> = Readonly<{
  contracts: ContractsHelpers;
  registry: QbiRegistry;
  transactions?: TransactionHelpers;
  codecs?: TCodecs;
}>;

export type QbiContractHandle<CCodecs extends QbiContractCodecs | undefined = undefined> =
  Readonly<{
    contract: QbiFile["contract"];
    getEntry(kind: QbiEntry["kind"], name: string): QbiEntry;
    query<Name extends string>(
      name: Name,
      input: QbiQueryInput<QbiFunctionInput<CCodecs, Name>, QbiFunctionOutput<CCodecs, Name>>,
    ): Promise<QbiQueryResult<QbiFunctionOutput<CCodecs, Name>>>;
    queryValue<Name extends string>(
      name: Name,
      input: QbiQueryInput<QbiFunctionInput<CCodecs, Name>, QbiFunctionOutput<CCodecs, Name>>,
    ): Promise<QbiFunctionOutput<CCodecs, Name>>;
    decodeOutput<Name extends string>(
      name: Name,
      outputBytes: Uint8Array,
      codec?: QbiCodec<QbiFunctionInput<CCodecs, Name>, QbiFunctionOutput<CCodecs, Name>>,
    ): QbiFunctionOutput<CCodecs, Name>;
    prepareProcedure(
      name: string,
      inputBytes: Uint8Array,
    ): Readonly<{
      contractIndex: number;
      inputType: number;
      inputBytes: Uint8Array;
    }>;
    buildProcedureTransaction<Name extends string>(
      input: QbiProcedureTxInput<QbiProcedureInput<CCodecs, Name>> & { name: Name },
    ): Promise<BuiltTransaction>;
    sendProcedure<Name extends string>(
      input: QbiProcedureTxInput<QbiProcedureInput<CCodecs, Name>> & { name: Name },
    ): Promise<SendTransactionResult>;
    sendProcedureAndConfirm<Name extends string>(
      input: QbiProcedureTxInput<QbiProcedureInput<CCodecs, Name>> &
        SendAndConfirmTransactionInput & { name: Name },
    ): Promise<SendTransactionResult>;
    sendProcedureAndConfirmWithReceipt<Name extends string>(
      input: QbiProcedureTxInput<QbiProcedureInput<CCodecs, Name>> &
        SendAndConfirmTransactionInput & { name: Name },
    ): Promise<SendTransactionReceipt>;
  }>;

export type QbiHelpers<TCodecs extends QbiCodecRegistry | undefined = undefined> = Readonly<{
  contract<Name extends keyof NonNullable<TCodecs> & string>(
    name: Name,
  ): QbiContractHandle<NonNullable<TCodecs>[Name]>;
  contract(nameOrIndex: string | number): QbiContractHandle;
  hasContract(nameOrIndex: string | number): boolean;
}>;

export type QbiProcedureTxInput<Input = unknown> = SeedSourceInput &
  Readonly<{
    name: string;
    amount?: bigint;
    targetTick?: bigint | number;
    inputBytes?: Uint8Array;
    inputValue?: Input;
    codec?: QbiCodec<Input, unknown>;
  }>;

export function defineQbiCodecs<TCodecs>(codecs: TCodecs & QbiCodecRegistry): TCodecs {
  return codecs;
}

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

export function createQbiHelpers(config: QbiHelpersConfig): QbiHelpers;
export function createQbiHelpers<TCodecs extends QbiCodecRegistry>(
  config: QbiHelpersConfig<TCodecs> & { codecs: TCodecs },
): QbiHelpers<TCodecs>;
export function createQbiHelpers<TCodecs extends QbiCodecRegistry | undefined = undefined>(
  config: QbiHelpersConfig<TCodecs>,
): QbiHelpers<TCodecs> {
  const { contracts, registry } = config;
  validateCodecs(config.codecs, registry);

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
    const contractCodecs = config.codecs?.[file.contract.name];
    const findEntry = (kind: QbiEntry["kind"], name: string): QbiEntry => {
      const entry = file.entries.find((e) => e.kind === kind && e.name === name);
      if (!entry) {
        throw new QbiEntryNotFoundError(`Unknown ${kind}: ${file.contract.name}.${name}`);
      }
      return entry;
    };

    const resolveCodec = <Input, Output>(
      kind: QbiEntry["kind"],
      name: string,
      provided?: QbiCodec<Input, Output>,
    ): QbiCodec<Input, Output> | undefined => {
      if (provided) return provided;
      const group = kind === "function" ? contractCodecs?.functions : contractCodecs?.procedures;
      const codec = group?.[name] as QbiCodec<Input, Output> | undefined;
      return codec;
    };

    const getInputBytes = <Input, Output>(
      entry: QbiEntry,
      input: QbiQueryInput<Input, Output>,
      codec?: QbiCodec<Input, Output>,
    ): Uint8Array => {
      if (input.inputBytes) return input.inputBytes;
      if (input.inputValue !== undefined) {
        if (!codec) {
          throw new QbiCodecMissingError(
            `QBI codec is required for inputValue (${file.contract.name}.${entry.name})`,
          );
        }
        try {
          return codec.encode(entry, input.inputValue);
        } catch (error) {
          throw new QbiCodecError(
            `QBI codec encode failed (${file.contract.name}.${entry.name}): ${String(error)}`,
          );
        }
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
      async query(name: string, input: QbiQueryInput): Promise<QbiQueryResult> {
        const entry = findEntry("function", name);
        if (!file.contract.contractIndex && file.contract.contractIndex !== 0) {
          throw new Error(`Contract index missing for ${file.contract.name}`);
        }

        const codec = resolveCodec("function", name, input.codec);
        const inputBytes = getInputBytes(entry, input, codec);
        if (
          entry.inputSize !== undefined &&
          entry.inputSize !== inputBytes.byteLength &&
          !input.allowSizeMismatch
        ) {
          throw new RangeError(
            `Input size mismatch: expected ${entry.inputSize}, got ${inputBytes.byteLength}`,
          );
        }

        const result = await contracts.queryRaw({
          contractIndex: file.contract.contractIndex,
          inputType: entry.inputType,
          inputBytes,
          expectedOutputSize: input.expectedOutputSize ?? entry.outputSize,
          retries: input.retries,
          retryDelayMs: input.retryDelayMs,
          signal: input.signal,
        });
        if (codec) {
          return {
            ...result,
            decoded: safeDecode(codec, entry, result.responseBytes, file.contract.name),
          };
        }
        return result;
      },
      async queryValue(name: string, input: QbiQueryInput): Promise<unknown> {
        const entry = findEntry("function", name);
        if (!file.contract.contractIndex && file.contract.contractIndex !== 0) {
          throw new Error(`Contract index missing for ${file.contract.name}`);
        }
        const codec = resolveCodec("function", name, input.codec);
        if (!codec) {
          throw new QbiCodecMissingError(`QBI codec missing for ${file.contract.name}.${name}`);
        }
        const inputBytes = getInputBytes(entry, input, codec);
        if (
          entry.inputSize !== undefined &&
          entry.inputSize !== inputBytes.byteLength &&
          !input.allowSizeMismatch
        ) {
          throw new RangeError(
            `Input size mismatch: expected ${entry.inputSize}, got ${inputBytes.byteLength}`,
          );
        }
        const result = await contracts.queryRaw({
          contractIndex: file.contract.contractIndex,
          inputType: entry.inputType,
          inputBytes,
          expectedOutputSize: input.expectedOutputSize ?? entry.outputSize,
          retries: input.retries,
          retryDelayMs: input.retryDelayMs,
          signal: input.signal,
        });
        return safeDecode(codec, entry, result.responseBytes, file.contract.name);
      },
      decodeOutput(name: string, outputBytes: Uint8Array, codec?: QbiCodec): unknown {
        const entry = findEntry("function", name);
        const resolved = resolveCodec("function", name, codec);
        if (!resolved) {
          throw new QbiCodecMissingError(`QBI codec missing for ${file.contract.name}.${name}`);
        }
        return safeDecode(resolved, entry, outputBytes, file.contract.name);
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
        const codec = resolveCodec("procedure", input.name, input.codec);
        const inputBytes = getInputBytes(
          entry,
          {
            inputBytes: input.inputBytes,
            inputValue: input.inputValue,
          },
          codec,
        );
        const toIdentity = getContractIdentity();
        const seedSource = toSeedSource(input);
        return config.transactions.buildSigned({
          ...seedSource,
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
        const codec = resolveCodec("procedure", input.name, input.codec);
        const inputBytes = getInputBytes(
          entry,
          {
            inputBytes: input.inputBytes,
            inputValue: input.inputValue,
          },
          codec,
        );
        const toIdentity = getContractIdentity();
        const seedSource = toSeedSource(input);
        return config.transactions.send({
          ...seedSource,
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
        const codec = resolveCodec("procedure", input.name, input.codec);
        const inputBytes = getInputBytes(
          entry,
          {
            inputBytes: input.inputBytes,
            inputValue: input.inputValue,
          },
          codec,
        );
        const toIdentity = getContractIdentity();
        const seedSource = toSeedSource(input);
        return config.transactions.sendAndConfirm({
          ...seedSource,
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
        const codec = resolveCodec("procedure", input.name, input.codec);
        const inputBytes = getInputBytes(
          entry,
          {
            inputBytes: input.inputBytes,
            inputValue: input.inputValue,
          },
          codec,
        );
        const toIdentity = getContractIdentity();
        const seedSource = toSeedSource(input);
        return config.transactions.sendAndConfirmWithReceipt({
          ...seedSource,
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

  const contract = ((nameOrIndex: string | number) =>
    toHandle(getContract(nameOrIndex))) as QbiHelpers<TCodecs>["contract"];

  return {
    contract,
    hasContract(nameOrIndex: string | number): boolean {
      return typeof nameOrIndex === "number"
        ? registry.byIndex.has(nameOrIndex)
        : registry.byName.has(nameOrIndex);
    },
  };
}

function toSeedSource(input: SeedSourceInput): SeedSourceInput {
  return "fromSeed" in input && typeof input.fromSeed === "string"
    ? { fromSeed: input.fromSeed }
    : { fromVault: input.fromVault };
}

function safeDecode<Output>(
  codec: QbiCodec<unknown, Output>,
  entry: QbiEntry,
  bytes: Uint8Array,
  contractName: string,
): Output {
  try {
    return codec.decode(entry, bytes);
  } catch (error) {
    throw new QbiCodecError(
      `QBI codec decode failed (${contractName}.${entry.name}): ${String(error)}`,
    );
  }
}

function validateCodecs(codecs: QbiCodecRegistry | undefined, registry: QbiRegistry): void {
  if (!codecs) return;

  for (const [contractName, contractCodecs] of Object.entries(codecs)) {
    const file = registry.byName.get(contractName);
    if (!file) {
      throw new QbiCodecValidationError(`QBI codecs reference unknown contract: ${contractName}`);
    }
    validateCodecEntries(file, contractCodecs.functions, "function", contractName);
    validateCodecEntries(file, contractCodecs.procedures, "procedure", contractName);
  }
}

function validateCodecEntries(
  file: QbiFile,
  codecs: Readonly<Record<string, QbiCodecLike>> | undefined,
  kind: QbiEntry["kind"],
  contractName: string,
): void {
  if (!codecs) return;
  for (const entryName of Object.keys(codecs)) {
    const entry = file.entries.find((e) => e.kind === kind && e.name === entryName);
    if (!entry) {
      throw new QbiCodecValidationError(
        `QBI codecs reference unknown ${kind}: ${contractName}.${entryName}`,
      );
    }
  }
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
