import { describe, expect, it } from "bun:test";
import { createRpcClient, RpcError } from "./client.js";

function createTestServer() {
  return Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);

      if (req.method === "GET" && url.pathname === "/live/v1/tick-info") {
        return Response.json({
          tickInfo: { tick: 123, duration: 1500, epoch: 12, initialTick: 100 },
        });
      }

      if (req.method === "GET" && url.pathname.startsWith("/live/v1/balances/")) {
        const id = decodeURIComponent(url.pathname.split("/").pop() ?? "");
        return Response.json({
          balance: {
            id,
            balance: "1000",
            validForTick: 123,
            latestIncomingTransferTick: 120,
            latestOutgoingTransferTick: 121,
            incomingAmount: "10",
            outgoingAmount: "5",
            numberOfIncomingTransfers: 2,
            numberOfOutgoingTransfers: 1,
          },
        });
      }

      if (req.method === "POST" && url.pathname === "/live/v1/broadcast-transaction") {
        const body = (await req.json()) as Record<string, unknown>;
        if (body.encodedTransaction !== "AQID") {
          return new Response(JSON.stringify({ error: "bad tx base64" }), { status: 400 });
        }
        return Response.json({
          peersBroadcasted: 3,
          encodedTransaction: body.encodedTransaction,
          transactionId: "tx_abc",
        });
      }

      if (req.method === "POST" && url.pathname === "/live/v1/querySmartContract") {
        const body = (await req.json()) as Record<string, unknown>;
        if (body.inputSize !== 2) {
          return new Response(JSON.stringify({ error: "bad inputSize" }), { status: 400 });
        }
        if (body.requestData !== "CQk=") {
          return new Response(JSON.stringify({ error: "bad requestData" }), { status: 400 });
        }
        return Response.json({ responseData: "AA==" });
      }

      if (req.method === "GET" && url.pathname === "/query/v1/getLastProcessedTick") {
        return Response.json({ tickNumber: 10, epoch: 1, intervalInitialTick: 0 });
      }

      if (req.method === "POST" && url.pathname === "/query/v1/getTransactionByHash") {
        const body = (await req.json()) as Record<string, unknown>;
        if (body.hash !== "deadbeef") {
          return new Response(JSON.stringify({ error: "bad hash" }), { status: 400 });
        }
        return Response.json({
          hash: "deadbeef",
          amount: "42",
          source: "SOURCE",
          destination: "DEST",
          tickNumber: 9,
          timestamp: "0",
          inputType: 0,
          inputSize: 0,
          inputData: "",
          signature: "",
          moneyFlew: true,
        });
      }

      return new Response("not found", { status: 404 });
    },
  });
}

describe("rpc client", () => {
  it("calls live tick-info and parses ints", async () => {
    const server = createTestServer();
    try {
      const rpc = createRpcClient({ baseUrl: server.url.toString() });
      const tickInfo = await rpc.live.tickInfo();
      expect(tickInfo.tick).toBe(123n);
      expect(tickInfo.epoch).toBe(12n);
    } finally {
      server.stop(true);
    }
  });

  it("calls live balances and parses bigints", async () => {
    const server = createTestServer();
    try {
      const rpc = createRpcClient({ baseUrl: server.url.toString() });
      const b = await rpc.live.balance("ID");
      expect(b.id).toBe("ID");
      expect(b.balance).toBe(1000n);
      expect(b.incomingAmount).toBe(10n);
    } finally {
      server.stop(true);
    }
  });

  it("broadcasts a base64 transaction", async () => {
    const server = createTestServer();
    try {
      const rpc = createRpcClient({ baseUrl: server.url.toString() });
      const res = await rpc.live.broadcastTransaction(new Uint8Array([1, 2, 3]));
      expect(res.transactionId).toBe("tx_abc");
      expect(res.peersBroadcasted).toBe(3);
    } finally {
      server.stop(true);
    }
  });

  it("queries a smart contract and decodes response bytes", async () => {
    const server = createTestServer();
    try {
      const rpc = createRpcClient({ baseUrl: server.url.toString() });
      const res = await rpc.live.querySmartContract({
        contractIndex: 0,
        inputType: 0,
        input: new Uint8Array([9, 9]),
      });
      expect(res.responseBase64).toBe("AA==");
      expect(Array.from(res.responseBytes)).toEqual([0]);
    } finally {
      server.stop(true);
    }
  });

  it("calls query getTransactionByHash and parses fields", async () => {
    const server = createTestServer();
    try {
      const rpc = createRpcClient({ baseUrl: server.url.toString() });
      const tx = await rpc.query.getTransactionByHash("deadbeef");
      expect(tx.amount).toBe(42n);
      expect(tx.moneyFlew).toBe(true);
    } finally {
      server.stop(true);
    }
  });

  it("throws RpcError on non-2xx responses", async () => {
    const server = createTestServer();
    try {
      const rpc = createRpcClient({ baseUrl: server.url.toString() });
      await expect(rpc.query.getTransactionsForTick(1)).rejects.toBeInstanceOf(RpcError);
    } finally {
      server.stop(true);
    }
  });
});
