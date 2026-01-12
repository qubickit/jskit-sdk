import { describe, expect, it } from "bun:test";
import type { FetchLike } from "../http.js";
import { createRpcClient } from "../rpc/client.js";
import {
  createTxConfirmationHelpers,
  TxConfirmationTimeoutError,
  TxNotFoundError,
} from "./confirm.js";

function createTestFetch() {
  let lastProcessed = 0;
  let getTxCalls = 0;

  return async (...args: Parameters<FetchLike>) => {
    const url = new URL(getUrl(args[0]));
    const method = getMethod(args[0], args[1]);

    if (method === "GET" && url.pathname === "/query/v1/getLastProcessedTick") {
      lastProcessed = Math.min(lastProcessed + 5, 10);
      return Response.json({ tickNumber: lastProcessed, epoch: 0, intervalInitialTick: 0 });
    }

    if (method === "POST" && url.pathname === "/query/v1/getTransactionByHash") {
      getTxCalls++;
      const body = readJsonBody(args[0], args[1]);
      if (body.hash !== "tx") return new Response("bad hash", { status: 400 });

      if (getTxCalls < 2) return new Response("not found", { status: 404 });
      return Response.json({
        hash: "tx",
        amount: "0",
        source: "S",
        destination: "D",
        tickNumber: 10,
        timestamp: "0",
        inputType: 0,
        inputSize: 0,
        inputData: "",
        signature: "",
      });
    }

    return new Response("not found", { status: 404 });
  };
}

describe("tx confirmation", () => {
  it("waits for lastProcessedTick >= targetTick and then finds tx", async () => {
    const rpc = createRpcClient({ baseUrl: "https://example.test", fetch: createTestFetch() });
    const confirm = createTxConfirmationHelpers({
      rpc,
      defaultTimeoutMs: 5_000,
      defaultPollIntervalMs: 1,
    });
    await confirm.waitForConfirmation({ txId: "tx", targetTick: 10, pollIntervalMs: 1 });
  });

  it("returns the confirmed transaction (receipt)", async () => {
    const rpc = createRpcClient({ baseUrl: "https://example.test", fetch: createTestFetch() });
    const confirm = createTxConfirmationHelpers({
      rpc,
      defaultTimeoutMs: 5_000,
      defaultPollIntervalMs: 1,
    });
    const tx = await confirm.waitForConfirmedTransaction({
      txId: "tx",
      targetTick: 10,
      pollIntervalMs: 1,
    });
    expect(tx.hash).toBe("tx");
    expect(tx.tickNumber).toBe(10n);
  });

  it("throws TxNotFoundError if target tick is reached but tx stays 404", async () => {
    const fetch: FetchLike = async (...args) => {
      const url = new URL(getUrl(args[0]));
      const method = getMethod(args[0], args[1]);
      if (method === "GET" && url.pathname === "/query/v1/getLastProcessedTick") {
        return Response.json({ tickNumber: 10, epoch: 0, intervalInitialTick: 0 });
      }
      if (method === "POST" && url.pathname === "/query/v1/getTransactionByHash") {
        return new Response("not found", { status: 404 });
      }
      return new Response("not found", { status: 404 });
    };

    const rpc = createRpcClient({ baseUrl: "https://example.test", fetch });
    const confirm = createTxConfirmationHelpers({
      rpc,
      defaultTimeoutMs: 20,
      defaultPollIntervalMs: 1,
    });
    await expect(
      confirm.waitForConfirmation({ txId: "tx", targetTick: 10 }),
    ).rejects.toBeInstanceOf(TxNotFoundError);
  });

  it("throws TxConfirmationTimeoutError if lastProcessedTick never reaches target", async () => {
    const fetch: FetchLike = async (...args) => {
      const url = new URL(getUrl(args[0]));
      const method = getMethod(args[0], args[1]);
      if (method === "GET" && url.pathname === "/query/v1/getLastProcessedTick") {
        return Response.json({ tickNumber: 0, epoch: 0, intervalInitialTick: 0 });
      }
      if (method === "POST" && url.pathname === "/query/v1/getTransactionByHash") {
        return new Response("not found", { status: 404 });
      }
      return new Response("not found", { status: 404 });
    };

    const rpc = createRpcClient({ baseUrl: "https://example.test", fetch });
    const confirm = createTxConfirmationHelpers({
      rpc,
      defaultTimeoutMs: 20,
      defaultPollIntervalMs: 1,
    });
    await expect(
      confirm.waitForConfirmation({ txId: "tx", targetTick: 10 }),
    ).rejects.toBeInstanceOf(TxConfirmationTimeoutError);
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
    // Our client doesn't use this path in tests, but keep it safe.
    throw new Error("Unexpected Request body");
  }
  const body = init?.body;
  if (typeof body === "string") {
    return JSON.parse(body) as Record<string, unknown>;
  }
  if (!body) return {};
  throw new Error("Unsupported body type");
}
