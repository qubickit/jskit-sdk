import { SdkError } from "../errors.js";

export type BobClientConfig = Readonly<{
  /** Base URL for QubicBob (default: http://localhost:40420). */
  baseUrl?: string;
  fetch?: typeof fetch;
  headers?: Readonly<Record<string, string>>;
  onRequest?: (info: Readonly<{ url: string; method: string; body?: unknown }>) => void;
  onResponse?: (
    info: Readonly<{ url: string; method: string; status: number; ok: boolean; durationMs: number }>,
  ) => void;
  onError?: (error: BobError) => void;
}>;

export class BobError extends SdkError {
  override name = "BobError";

  constructor(
    code: string,
    message: string,
    readonly details: Readonly<{
      url: string;
      method: string;
      status?: number;
      statusText?: string;
      bodyText?: string;
    }>,
    cause?: unknown,
  ) {
    super(code, message, details, cause);
  }
}

export type BobQuerySmartContractInput = Readonly<{
  nonce?: number;
  scIndex: number;
  funcNumber: number;
  dataHex?: string;
  dataBytes?: Uint8Array;
}>;

export type BobQuerySmartContractResult = Readonly<{
  nonce: number;
  pending: boolean;
  dataHex?: string;
  message?: string;
}>;

export type BobClient = Readonly<{
  status(): Promise<unknown>;
  balance(identity: string): Promise<unknown>;
  asset(input: {
    identity: string;
    issuer: string;
    assetName: string;
    manageSCIndex: number;
  }): Promise<unknown>;
  epochInfo(epoch: number): Promise<unknown>;
  tx(hash: string): Promise<unknown>;
  logRange(input: { epoch: number; fromId: number; toId: number }): Promise<unknown>;
  tick(tickNumber: number): Promise<unknown>;
  findLog(input: {
    fromTick: number;
    toTick: number;
    scIndex: number;
    logType: number;
    topic1: string;
    topic2: string;
    topic3: string;
  }): Promise<unknown>;
  getLogCustom(input: {
    epoch: number;
    tick: number;
    scIndex: number;
    logType: number;
    topic1: string;
    topic2: string;
    topic3: string;
  }): Promise<unknown>;
  querySmartContract(input: BobQuerySmartContractInput): Promise<BobQuerySmartContractResult>;
  broadcastTransaction(input: { dataHex?: string; dataBytes?: Uint8Array }): Promise<unknown>;
  getQuTransfersForIdentity(input: {
    fromTick: number;
    toTick: number;
    identity: string;
  }): Promise<unknown>;
  getAssetTransfersForIdentity(input: {
    fromTick: number;
    toTick: number;
    identity: string;
    assetIssuer: string;
    assetName: string;
  }): Promise<unknown>;
  getAllAssetTransfers(input: {
    fromTick: number;
    toTick: number;
    assetIssuer: string;
    assetName: string;
  }): Promise<unknown>;
}>;

export function createBobClient(config: BobClientConfig = {}): BobClient {
  const baseUrl = ensureTrailingSlash(config.baseUrl ?? "http://localhost:40420");
  const base = new URL(baseUrl);
  const doFetch = config.fetch ?? fetch;

  const requestJson = async (method: string, url: URL, body?: unknown): Promise<unknown> => {
    const start = Date.now();
    const headers: Record<string, string> = {
      accept: "application/json",
      ...config.headers,
    };
    let bodyText: string | undefined;
    if (body !== undefined) {
      headers["content-type"] = "application/json";
      bodyText = JSON.stringify(body);
    }

    config.onRequest?.({ url: url.toString(), method, body });
    const res = await doFetch(url, {
      method,
      headers,
      body: bodyText,
    });
    config.onResponse?.({
      url: url.toString(),
      method,
      status: res.status,
      ok: res.ok,
      durationMs: Date.now() - start,
    });

    const text = await res.text();
    if (!res.ok) {
      const error = new BobError(
        "bob_request_failed",
        `QubicBob request failed: ${res.status} ${res.statusText}`,
        {
          url: url.toString(),
          method,
          status: res.status,
          statusText: res.statusText,
          bodyText: text || undefined,
        },
      );
      config.onError?.(error);
      throw error;
    }

    if (text.length === 0) return null;
    try {
      return JSON.parse(text) as unknown;
    } catch {
      const error = new BobError("bob_invalid_json", "QubicBob response was not valid JSON", {
        url: url.toString(),
        method,
        status: res.status,
        statusText: res.statusText,
        bodyText: text || undefined,
      });
      config.onError?.(error);
      throw error;
    }
  };

  return {
    async status(): Promise<unknown> {
      const url = new URL("status", base);
      return requestJson("GET", url);
    },

    async balance(identity: string): Promise<unknown> {
      const url = new URL(`balance/${encodeURIComponent(identity)}`, base);
      return requestJson("GET", url);
    },

    async asset(input): Promise<unknown> {
      const url = new URL(
        `asset/${encodeURIComponent(input.identity)}/${encodeURIComponent(
          input.issuer,
        )}/${encodeURIComponent(input.assetName)}/${input.manageSCIndex}`,
        base,
      );
      return requestJson("GET", url);
    },

    async epochInfo(epoch: number): Promise<unknown> {
      const url = new URL(`epochinfo/${epoch}`, base);
      return requestJson("GET", url);
    },

    async tx(hash: string): Promise<unknown> {
      const url = new URL(`tx/${encodeURIComponent(hash)}`, base);
      return requestJson("GET", url);
    },

    async logRange(input): Promise<unknown> {
      const url = new URL(`log/${input.epoch}/${input.fromId}/${input.toId}`, base);
      return requestJson("GET", url);
    },

    async tick(tickNumber: number): Promise<unknown> {
      const url = new URL(`tick/${tickNumber}`, base);
      return requestJson("GET", url);
    },

    async findLog(input): Promise<unknown> {
      const url = new URL("findLog", base);
      return requestJson("POST", url, input);
    },

    async getLogCustom(input): Promise<unknown> {
      const url = new URL("getlogcustom", base);
      return requestJson("POST", url, input);
    },

    async querySmartContract(input: BobQuerySmartContractInput): Promise<BobQuerySmartContractResult> {
      const nonce = input.nonce ?? randomUint32();
      const dataHex = input.dataHex ?? (input.dataBytes ? toHex(input.dataBytes) : "");
      const url = new URL("querySmartContract", base);

      const headers: Record<string, string> = {
        accept: "application/json",
        "content-type": "application/json",
        ...config.headers,
      };
      const bodyText = JSON.stringify({
        nonce,
        scIndex: input.scIndex,
        funcNumber: input.funcNumber,
        data: dataHex,
      });

      const start = Date.now();
      config.onRequest?.({ url: url.toString(), method: "POST", body: JSON.parse(bodyText) });
      const res = await doFetch(url, { method: "POST", headers, body: bodyText });
      config.onResponse?.({
        url: url.toString(),
        method: "POST",
        status: res.status,
        ok: res.ok,
        durationMs: Date.now() - start,
      });
      const text = await res.text();
      let json: unknown = null;
      if (text.length) {
        try {
          json = JSON.parse(text) as unknown;
        } catch {
          const error = new BobError("bob_invalid_json", "QubicBob response was not valid JSON", {
            url: url.toString(),
            method: "POST",
            status: res.status,
            statusText: res.statusText,
            bodyText: text || undefined,
          });
          config.onError?.(error);
          throw error;
        }
      }

      if (res.status === 202) {
        const obj = expectObject(json);
        return {
          nonce,
          pending: true,
          message: typeof obj.message === "string" ? obj.message : "pending",
        };
      }

      if (!res.ok) {
        const error = new BobError(
          "bob_request_failed",
          `QubicBob request failed: ${res.status} ${res.statusText}`,
          {
            url: url.toString(),
            method: "POST",
            status: res.status,
            statusText: res.statusText,
            bodyText: text || undefined,
          },
        );
        config.onError?.(error);
        throw error;
      }

      const obj = expectObject(json);
      return {
        nonce,
        pending: false,
        dataHex: typeof obj.data === "string" ? obj.data : undefined,
      };
    },

    async broadcastTransaction(input): Promise<unknown> {
      const dataHex = input.dataHex ?? (input.dataBytes ? toHex(input.dataBytes) : "");
      if (!dataHex) throw new TypeError("broadcastTransaction requires dataHex or dataBytes");
      const url = new URL("broadcastTransaction", base);
      return requestJson("POST", url, { data: dataHex });
    },

    async getQuTransfersForIdentity(input): Promise<unknown> {
      const url = new URL("getQuTransfersForIdentity", base);
      return requestJson("POST", url, input);
    },

    async getAssetTransfersForIdentity(input): Promise<unknown> {
      const url = new URL("getAssetTransfersForIdentity", base);
      return requestJson("POST", url, input);
    },

    async getAllAssetTransfers(input): Promise<unknown> {
      const url = new URL("getAllAssetTransfers", base);
      return requestJson("POST", url, input);
    },
  };
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function expectObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") return {};
  return value as Record<string, unknown>;
}

function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

function randomUint32(): number {
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0]!;
  }
  return Math.floor(Math.random() * 0xffff_ffff);
}
