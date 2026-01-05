export type RpcClientConfig = Readonly<{
  /**
   * RPC base URL (recommended: `https://rpc.qubic.org`).
   * You may also pass a baseUrl that already includes `/live/v1` or `/query/v1`;
   * those suffixes are stripped automatically.
   */
  baseUrl?: string;
  fetch?: typeof fetch;
  headers?: Readonly<Record<string, string>>;
}>;

export class RpcError extends Error {
  override name = "RpcError";

  constructor(
    message: string,
    readonly details: Readonly<{
      url: string;
      method: string;
      status?: number;
      statusText?: string;
      bodyText?: string;
    }>,
  ) {
    super(message);
  }
}

export type TickInfo = Readonly<{
  tick: bigint;
  duration: bigint;
  epoch: bigint;
  initialTick: bigint;
}>;

export type LiveBalance = Readonly<{
  id: string;
  balance: bigint;
  validForTick: bigint;
  latestIncomingTransferTick: bigint;
  latestOutgoingTransferTick: bigint;
  incomingAmount: bigint;
  outgoingAmount: bigint;
  numberOfIncomingTransfers: bigint;
  numberOfOutgoingTransfers: bigint;
}>;

export type BroadcastTransactionResult = Readonly<{
  peersBroadcasted: number;
  encodedTransaction: string;
  transactionId: string;
}>;

export type LastProcessedTick = Readonly<{
  tickNumber: bigint;
  epoch: bigint;
  intervalInitialTick: bigint;
}>;

export type QueryTransaction = Readonly<{
  hash: string;
  amount: bigint;
  source: string;
  destination: string;
  tickNumber: bigint;
  timestamp: bigint;
  inputType: bigint;
  inputSize: bigint;
  inputData: string;
  signature: string;
  moneyFlew?: boolean;
}>;

export type Hits = Readonly<{ total: bigint; from: bigint; size: bigint }>;

export type Range = Readonly<{
  gt?: string;
  gte?: string;
  lt?: string;
  lte?: string;
}>;

export type Pagination = Readonly<{ offset?: bigint; size?: bigint }>;

export type TransactionsForIdentityRequest = Readonly<{
  identity: string;
  filters?: Readonly<Record<string, string>>;
  ranges?: Readonly<Record<string, Range>>;
  pagination?: Pagination;
}>;

export type TransactionsForIdentityResponse = Readonly<{
  validForTick: bigint;
  hits: Hits;
  transactions: readonly QueryTransaction[];
}>;

export type TickData = Readonly<{
  tickNumber: bigint;
  epoch: bigint;
  computorIndex: bigint;
  timestamp: bigint;
  varStruct: string;
  timeLock: string;
  transactionHashes: readonly string[];
  contractFees: readonly bigint[];
  signature: string;
}>;

export type RpcClient = Readonly<{
  live: Readonly<{
    tickInfo(): Promise<TickInfo>;
    balance(identity: string): Promise<LiveBalance>;
    broadcastTransaction(tx: Uint8Array | string): Promise<BroadcastTransactionResult>;
    querySmartContract(input: {
      contractIndex: bigint | number;
      inputType: bigint | number;
      input: Uint8Array | string;
    }): Promise<{ responseBytes: Uint8Array; responseBase64: string }>;
  }>;
  query: Readonly<{
    getLastProcessedTick(): Promise<LastProcessedTick>;
    getTransactionByHash(hash: string): Promise<QueryTransaction>;
    getTransactionsForIdentity(
      input: TransactionsForIdentityRequest,
    ): Promise<TransactionsForIdentityResponse>;
    getTransactionsForTick(tickNumber: bigint | number): Promise<readonly QueryTransaction[]>;
    getTickData(tickNumber: bigint | number): Promise<TickData>;
  }>;
}>;

export function createRpcClient(config: RpcClientConfig = {}): RpcClient {
  const baseUrl = normalizeRpcBaseUrl(config.baseUrl ?? "https://rpc.qubic.org");
  const base = new URL(ensureTrailingSlash(baseUrl));
  const doFetch = config.fetch ?? fetch;

  const requestJson = async (method: string, url: URL, body?: unknown): Promise<unknown> => {
    const headers: Record<string, string> = {
      accept: "application/json",
      ...config.headers,
    };
    let bodyText: string | undefined;
    if (body !== undefined) {
      headers["content-type"] = "application/json";
      bodyText = JSON.stringify(body);
    }

    const res = await doFetch(url, {
      method,
      headers,
      body: bodyText,
    });

    const text = await res.text();
    if (!res.ok) {
      throw new RpcError(`RPC request failed: ${res.status} ${res.statusText}`, {
        url: url.toString(),
        method,
        status: res.status,
        statusText: res.statusText,
        bodyText: text || undefined,
      });
    }

    if (text.length === 0) return null;
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new RpcError("RPC response was not valid JSON", {
        url: url.toString(),
        method,
        status: res.status,
        statusText: res.statusText,
        bodyText: text || undefined,
      });
    }
  };

  const live = {
    async tickInfo(): Promise<TickInfo> {
      const url = new URL("live/v1/tick-info", base);
      const json = await requestJson("GET", url);
      const obj = expectObject(json);
      const tickInfo = expectObject(obj.tickInfo);
      return {
        tick: parseJsonInteger(tickInfo.tick, "tickInfo.tick"),
        duration: parseJsonInteger(tickInfo.duration, "tickInfo.duration"),
        epoch: parseJsonInteger(tickInfo.epoch, "tickInfo.epoch"),
        initialTick: parseJsonInteger(tickInfo.initialTick, "tickInfo.initialTick"),
      };
    },

    async balance(identity: string): Promise<LiveBalance> {
      const url = new URL(`live/v1/balances/${encodeURIComponent(identity)}`, base);
      const json = await requestJson("GET", url);
      const obj = expectObject(json);
      const bal = expectObject(obj.balance);
      return {
        id: expectString(bal.id, "balance.id"),
        balance: parseJsonBigintString(bal.balance, "balance.balance"),
        validForTick: parseJsonInteger(bal.validForTick, "balance.validForTick"),
        latestIncomingTransferTick: parseJsonInteger(
          bal.latestIncomingTransferTick,
          "balance.latestIncomingTransferTick",
        ),
        latestOutgoingTransferTick: parseJsonInteger(
          bal.latestOutgoingTransferTick,
          "balance.latestOutgoingTransferTick",
        ),
        incomingAmount: parseJsonBigintString(bal.incomingAmount, "balance.incomingAmount"),
        outgoingAmount: parseJsonBigintString(bal.outgoingAmount, "balance.outgoingAmount"),
        numberOfIncomingTransfers: parseJsonInteger(
          bal.numberOfIncomingTransfers,
          "balance.numberOfIncomingTransfers",
        ),
        numberOfOutgoingTransfers: parseJsonInteger(
          bal.numberOfOutgoingTransfers,
          "balance.numberOfOutgoingTransfers",
        ),
      };
    },

    async broadcastTransaction(tx: Uint8Array | string): Promise<BroadcastTransactionResult> {
      const encodedTransaction = typeof tx === "string" ? tx : encodeBase64(tx);
      const url = new URL("live/v1/broadcast-transaction", base);
      const json = await requestJson("POST", url, { encodedTransaction });
      const obj = expectObject(json);
      return {
        peersBroadcasted: expectInt32(obj.peersBroadcasted, "peersBroadcasted"),
        encodedTransaction: expectString(obj.encodedTransaction, "encodedTransaction"),
        transactionId: expectString(obj.transactionId, "transactionId"),
      };
    },

    async querySmartContract(input: {
      contractIndex: bigint | number;
      inputType: bigint | number;
      input: Uint8Array | string;
    }): Promise<{ responseBytes: Uint8Array; responseBase64: string }> {
      const requestBytes =
        typeof input.input === "string" ? decodeBase64(input.input) : input.input;
      const requestData = encodeBase64(requestBytes);
      const url = new URL("live/v1/querySmartContract", base);
      const json = await requestJson("POST", url, {
        contractIndex: toJsonInteger(input.contractIndex),
        inputType: toJsonInteger(input.inputType),
        inputSize: toJsonInteger(requestBytes.byteLength),
        requestData,
      });
      const obj = expectObject(json);
      const responseBase64 = expectString(obj.responseData, "responseData");
      return { responseBytes: decodeBase64(responseBase64), responseBase64 };
    },
  } as const;

  const query = {
    async getLastProcessedTick(): Promise<LastProcessedTick> {
      const url = new URL("query/v1/getLastProcessedTick", base);
      const json = await requestJson("GET", url);
      const obj = expectObject(json);
      return {
        tickNumber: parseJsonInteger(obj.tickNumber, "tickNumber"),
        epoch: parseJsonInteger(obj.epoch, "epoch"),
        intervalInitialTick: parseJsonInteger(obj.intervalInitialTick, "intervalInitialTick"),
      };
    },

    async getTransactionByHash(hash: string): Promise<QueryTransaction> {
      const url = new URL("query/v1/getTransactionByHash", base);
      const json = await requestJson("POST", url, { hash });
      return parseQueryTransaction(json, "transaction");
    },

    async getTransactionsForIdentity(
      input: TransactionsForIdentityRequest,
    ): Promise<TransactionsForIdentityResponse> {
      const url = new URL("query/v1/getTransactionsForIdentity", base);
      const json = await requestJson("POST", url, serializeIdentityTxQuery(input));
      const obj = expectObject(json);
      const hits = expectObject(obj.hits);
      const txs = expectArray(obj.transactions, "transactions").map((t, i) =>
        parseQueryTransaction(t, `transactions[${i}]`),
      );
      return {
        validForTick: parseJsonInteger(obj.validForTick, "validForTick"),
        hits: {
          total: parseJsonInteger(hits.total, "hits.total"),
          from: parseJsonInteger(hits.from, "hits.from"),
          size: parseJsonInteger(hits.size, "hits.size"),
        },
        transactions: txs,
      };
    },

    async getTransactionsForTick(
      tickNumber: bigint | number,
    ): Promise<readonly QueryTransaction[]> {
      const url = new URL("query/v1/getTransactionsForTick", base);
      const json = await requestJson("POST", url, { tickNumber: toJsonInteger(tickNumber) });
      const obj = expectObject(json);
      return expectArray(obj.transactions, "transactions").map((t, i) =>
        parseQueryTransaction(t, `transactions[${i}]`),
      );
    },

    async getTickData(tickNumber: bigint | number): Promise<TickData> {
      const url = new URL("query/v1/getTickData", base);
      const json = await requestJson("POST", url, { tickNumber: toJsonInteger(tickNumber) });
      const obj = expectObject(json);
      const tickData = expectObject(obj.tickData);
      return {
        tickNumber: parseJsonInteger(tickData.tickNumber, "tickData.tickNumber"),
        epoch: parseJsonInteger(tickData.epoch, "tickData.epoch"),
        computorIndex: parseJsonInteger(tickData.computorIndex, "tickData.computorIndex"),
        timestamp: parseJsonBigintString(tickData.timestamp, "tickData.timestamp"),
        varStruct: expectString(tickData.varStruct, "tickData.varStruct"),
        timeLock: expectString(tickData.timeLock, "tickData.timeLock"),
        transactionHashes: expectArray(
          tickData.transactionHashes,
          "tickData.transactionHashes",
        ).map((s, i) => expectString(s, `tickData.transactionHashes[${i}]`)),
        contractFees: expectArray(tickData.contractFees, "tickData.contractFees").map((s, i) =>
          parseJsonBigintString(s, `tickData.contractFees[${i}]`),
        ),
        signature: expectString(tickData.signature, "tickData.signature"),
      };
    },
  } as const;

  return { live, query };
}

function normalizeRpcBaseUrl(input: string): string {
  const url = new URL(ensureTrailingSlash(input));
  const path = url.pathname.replace(/\/+$/, "");
  if (path.endsWith("/live/v1")) {
    url.pathname = path.slice(0, -"/live/v1".length) || "/";
  } else if (path.endsWith("/query/v1")) {
    url.pathname = path.slice(0, -"/query/v1".length) || "/";
  }
  url.pathname = ensureTrailingSlash(url.pathname);
  return url.toString();
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function encodeBase64(bytes: Uint8Array): string {
  // Node/Bun
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");

  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  // Browser fallback
  return btoa(binary);
}

function decodeBase64(base64: string): Uint8Array {
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(base64, "base64"));
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function expectObject(value: unknown, label = "value"): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new RpcError(`Invalid RPC payload: ${label} is not an object`, {
      url: "",
      method: "",
    });
  }
  return value as Record<string, unknown>;
}

function expectArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new RpcError(`Invalid RPC payload: ${label} is not an array`, { url: "", method: "" });
  }
  return value;
}

function expectString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new RpcError(`Invalid RPC payload: ${label} is not a string`, { url: "", method: "" });
  }
  return value;
}

function expectInt32(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new RpcError(`Invalid RPC payload: ${label} is not an int`, { url: "", method: "" });
  }
  if (value < -2147483648 || value > 2147483647) {
    throw new RpcError(`Invalid RPC payload: ${label} is not int32`, { url: "", method: "" });
  }
  return value;
}

function parseJsonInteger(value: unknown, label: string): bigint {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      throw new RpcError(`Invalid RPC payload: ${label} is not an integer`, {
        url: "",
        method: "",
      });
    }
    return BigInt(value);
  }
  if (typeof value === "string") {
    if (!/^-?\d+$/.test(value)) {
      throw new RpcError(`Invalid RPC payload: ${label} is not an integer string`, {
        url: "",
        method: "",
      });
    }
    return BigInt(value);
  }
  throw new RpcError(`Invalid RPC payload: ${label} is not an integer`, { url: "", method: "" });
}

function parseJsonBigintString(value: unknown, label: string): bigint {
  const text = expectString(value, label);
  if (!/^-?\d+$/.test(text)) {
    throw new RpcError(`Invalid RPC payload: ${label} is not a decimal string`, {
      url: "",
      method: "",
    });
  }
  return BigInt(text);
}

function toJsonInteger(value: bigint | number): number | string {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      throw new TypeError("Expected integer number");
    }
    return value;
  }
  const asNumber = Number(value);
  if (Number.isSafeInteger(asNumber)) return asNumber;
  return value.toString(10);
}

function parseQueryTransaction(value: unknown, label: string): QueryTransaction {
  const obj = expectObject(value, label);
  const tx: QueryTransaction = {
    hash: expectString(obj.hash, `${label}.hash`),
    amount: parseJsonBigintString(obj.amount, `${label}.amount`),
    source: expectString(obj.source, `${label}.source`),
    destination: expectString(obj.destination, `${label}.destination`),
    tickNumber: parseJsonInteger(obj.tickNumber, `${label}.tickNumber`),
    timestamp: parseJsonBigintString(obj.timestamp, `${label}.timestamp`),
    inputType: parseJsonInteger(obj.inputType, `${label}.inputType`),
    inputSize: parseJsonInteger(obj.inputSize, `${label}.inputSize`),
    inputData: expectString(obj.inputData, `${label}.inputData`),
    signature: expectString(obj.signature, `${label}.signature`),
  };
  if (typeof obj.moneyFlew === "boolean") {
    return { ...tx, moneyFlew: obj.moneyFlew };
  }
  if (obj.moneyFlew === undefined) return tx;
  throw new RpcError(`Invalid RPC payload: ${label}.moneyFlew is not boolean`, {
    url: "",
    method: "",
  });
}

function serializeIdentityTxQuery(input: TransactionsForIdentityRequest): Record<string, unknown> {
  const body: Record<string, unknown> = { identity: input.identity };
  if (input.filters) body.filters = input.filters;
  if (input.ranges) body.ranges = input.ranges;
  if (input.pagination) {
    body.pagination = {
      ...(input.pagination.offset !== undefined
        ? { offset: toJsonInteger(input.pagination.offset) }
        : {}),
      ...(input.pagination.size !== undefined
        ? { size: toJsonInteger(input.pagination.size) }
        : {}),
    };
  }
  return body;
}
