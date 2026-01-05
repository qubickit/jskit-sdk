import { describe, expect, it } from "bun:test";
import { createRpcClient } from "../rpc/client.js";
import {
  createTxConfirmationHelpers,
  TxConfirmationTimeoutError,
  TxNotFoundError,
} from "./confirm.js";

function createTestServer() {
  let lastProcessed = 0;
  let getTxCalls = 0;

  return Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);

      if (req.method === "GET" && url.pathname === "/query/v1/getLastProcessedTick") {
        lastProcessed = Math.min(lastProcessed + 5, 10);
        return Response.json({ tickNumber: lastProcessed, epoch: 0, intervalInitialTick: 0 });
      }

      if (req.method === "POST" && url.pathname === "/query/v1/getTransactionByHash") {
        getTxCalls++;
        const body = (await req.json()) as Record<string, unknown>;
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
    },
  });
}

describe("tx confirmation", () => {
  it("waits for lastProcessedTick >= targetTick and then finds tx", async () => {
    const server = createTestServer();
    try {
      const rpc = createRpcClient({ baseUrl: server.url.toString() });
      const confirm = createTxConfirmationHelpers({
        rpc,
        defaultTimeoutMs: 5_000,
        defaultPollIntervalMs: 1,
      });
      await confirm.waitForConfirmation({ txId: "tx", targetTick: 10, pollIntervalMs: 1 });
    } finally {
      server.stop(true);
    }
  });

  it("returns the confirmed transaction (receipt)", async () => {
    const server = createTestServer();
    try {
      const rpc = createRpcClient({ baseUrl: server.url.toString() });
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
    } finally {
      server.stop(true);
    }
  });

  it("throws TxNotFoundError if target tick is reached but tx stays 404", async () => {
    const server = Bun.serve({
      port: 0,
      async fetch(req) {
        const url = new URL(req.url);
        if (req.method === "GET" && url.pathname === "/query/v1/getLastProcessedTick") {
          return Response.json({ tickNumber: 10, epoch: 0, intervalInitialTick: 0 });
        }
        if (req.method === "POST" && url.pathname === "/query/v1/getTransactionByHash") {
          return new Response("not found", { status: 404 });
        }
        return new Response("not found", { status: 404 });
      },
    });

    try {
      const rpc = createRpcClient({ baseUrl: server.url.toString() });
      const confirm = createTxConfirmationHelpers({
        rpc,
        defaultTimeoutMs: 20,
        defaultPollIntervalMs: 1,
      });
      await expect(
        confirm.waitForConfirmation({ txId: "tx", targetTick: 10 }),
      ).rejects.toBeInstanceOf(TxNotFoundError);
    } finally {
      server.stop(true);
    }
  });

  it("throws TxConfirmationTimeoutError if lastProcessedTick never reaches target", async () => {
    const server = Bun.serve({
      port: 0,
      async fetch(req) {
        const url = new URL(req.url);
        if (req.method === "GET" && url.pathname === "/query/v1/getLastProcessedTick") {
          return Response.json({ tickNumber: 0, epoch: 0, intervalInitialTick: 0 });
        }
        if (req.method === "POST" && url.pathname === "/query/v1/getTransactionByHash") {
          return new Response("not found", { status: 404 });
        }
        return new Response("not found", { status: 404 });
      },
    });

    try {
      const rpc = createRpcClient({ baseUrl: server.url.toString() });
      const confirm = createTxConfirmationHelpers({
        rpc,
        defaultTimeoutMs: 20,
        defaultPollIntervalMs: 1,
      });
      await expect(
        confirm.waitForConfirmation({ txId: "tx", targetTick: 10 }),
      ).rejects.toBeInstanceOf(TxConfirmationTimeoutError);
    } finally {
      server.stop(true);
    }
  });
});
