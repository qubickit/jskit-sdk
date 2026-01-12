import { describe, expect, it } from "bun:test";
import { createRpcClient } from "./rpc/client.js";
import { createContractHelpers } from "./contracts.js";

function createQueryFetch(responses: Uint8Array[]) {
  let calls = 0;
  const history = { calls: 0 };
  const fetch: typeof globalThis.fetch = async (...args) => {
    const url = new URL(getUrl(args[0]));
    const method = getMethod(args[0], args[1]);
    if (method === "POST" && url.pathname === "/live/v1/querySmartContract") {
      const response = responses[Math.min(calls, responses.length - 1)] ?? new Uint8Array();
      calls++;
      history.calls = calls;
      return Response.json({
        responseData: Buffer.from(response).toString("base64"),
      });
    }
    return new Response("not found", { status: 404 });
  };
  return { fetch, history };
}

describe("contracts.queryRaw", () => {
  it("retries when response is shorter than expected", async () => {
    const { fetch, history } = createQueryFetch([new Uint8Array(), new Uint8Array([1, 2, 3, 4])]);
    const rpc = createRpcClient({ baseUrl: "https://example.test", fetch });
    const contracts = createContractHelpers({ rpc, defaultRetries: 2, defaultRetryDelayMs: 1 });

    const res = await contracts.queryRaw({
      contractIndex: 1,
      inputType: 1,
      inputBytes: new Uint8Array(),
      expectedOutputSize: 4,
      retryDelayMs: 1,
    });

    expect(res.responseBytes.length).toBe(4);
    expect(res.attempts).toBe(2);
    expect(history.calls).toBe(2);
  });

  it("returns immediately when no expected size is provided", async () => {
    const { fetch, history } = createQueryFetch([new Uint8Array([9])]);
    const rpc = createRpcClient({ baseUrl: "https://example.test", fetch });
    const contracts = createContractHelpers({ rpc });

    const res = await contracts.queryRaw({
      contractIndex: 1,
      inputType: 1,
      inputBytes: new Uint8Array(),
    });

    expect(res.responseBytes.length).toBe(1);
    expect(res.attempts).toBe(1);
    expect(history.calls).toBe(1);
  });
});

function getUrl(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function getMethod(input: Parameters<typeof fetch>[0], init: Parameters<typeof fetch>[1]): string {
  if (init?.method) return init.method;
  if (input instanceof Request) return input.method;
  return "GET";
}
