import { describe, expect, it } from "bun:test";
import { createBobClient } from "./client.js";

describe("bob client", () => {
  it("querySmartContract sends hex payload and parses response", async () => {
    let body: Record<string, unknown> | undefined;
    const requests: string[] = [];
    const responses: number[] = [];
    const fetch: typeof globalThis.fetch = async (...args) => {
      const url = new URL(getUrl(args[0]));
      const method = getMethod(args[0], args[1]);
      if (method === "POST" && url.pathname === "/querySmartContract") {
        body = readJsonBody(args[0], args[1]);
        return Response.json({ nonce: body?.nonce, data: "abcd" });
      }
      return new Response("not found", { status: 404 });
    };

    const bob = createBobClient({
      baseUrl: "http://example.test",
      fetch,
      onRequest: (info) => requests.push(info.url),
      onResponse: (info) => responses.push(info.status),
    });
    const res = await bob.querySmartContract({
      scIndex: 1,
      funcNumber: 2,
      dataBytes: new Uint8Array([0xab, 0xcd]),
    });

    expect(res.pending).toBe(false);
    expect(res.dataHex).toBe("abcd");
    expect(body?.data).toBe("abcd");
    expect(requests.length).toBeGreaterThan(0);
    expect(responses.length).toBeGreaterThan(0);
  });

  it("querySmartContract handles pending responses", async () => {
    const fetch: typeof globalThis.fetch = async (...args) => {
      const url = new URL(getUrl(args[0]));
      const method = getMethod(args[0], args[1]);
      if (method === "POST" && url.pathname === "/querySmartContract") {
        return new Response(JSON.stringify({ error: "pending", message: "try later" }), {
          status: 202,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response("not found", { status: 404 });
    };

    const bob = createBobClient({ baseUrl: "http://example.test", fetch });
    const res = await bob.querySmartContract({ scIndex: 1, funcNumber: 2, dataHex: "00" });
    expect(res.pending).toBe(true);
    expect(res.message).toBe("try later");
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

function readJsonBody(
  input: Parameters<typeof fetch>[0],
  init: Parameters<typeof fetch>[1],
): Record<string, unknown> {
  if (input instanceof Request) {
    throw new Error("Unexpected Request body");
  }
  const body = init?.body;
  if (typeof body === "string") {
    return JSON.parse(body) as Record<string, unknown>;
  }
  if (!body) return {};
  throw new Error("Unsupported body type");
}
