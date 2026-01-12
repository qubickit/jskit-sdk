import { describe, expect, it } from "bun:test";
import { createRpcClient, RpcError } from "./client.js";

function createTestFetch(): typeof fetch {
  return async (input, init) => {
    const req = new Request(input, init);
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

    if (req.method === "GET" && url.pathname === "/query/v1/getProcessedTickIntervals") {
      return Response.json({
        processedTickIntervals: [
          { epoch: 1, firstTick: 0, lastTick: 10 },
          { epoch: 2, firstTick: 11, lastTick: 20 },
        ],
      });
    }

    if (req.method === "POST" && url.pathname === "/query/v1/getComputorListsForEpoch") {
      const body = (await req.json()) as Record<string, unknown>;
      if (body.epoch !== 1) {
        return new Response(JSON.stringify({ error: "bad epoch" }), { status: 400 });
      }
      return Response.json({
        computorsLists: [
          {
            epoch: 1,
            tickNumber: 10,
            identities: ["A", "B"],
            signature: "SIG",
          },
        ],
      });
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
  };
}

describe("rpc client", () => {
  it("calls live tick-info and parses ints", async () => {
    const rpc = createRpcClient({ baseUrl: "https://example.test", fetch: createTestFetch() });
    const tickInfo = await rpc.live.tickInfo();
    expect(tickInfo.tick).toBe(123n);
    expect(tickInfo.epoch).toBe(12n);
  });

  it("calls live balances and parses bigints", async () => {
    const rpc = createRpcClient({ baseUrl: "https://example.test", fetch: createTestFetch() });
    const b = await rpc.live.balance("ID");
    expect(b.id).toBe("ID");
    expect(b.balance).toBe(1000n);
    expect(b.incomingAmount).toBe(10n);
  });

  it("broadcasts a base64 transaction", async () => {
    const rpc = createRpcClient({ baseUrl: "https://example.test", fetch: createTestFetch() });
    const res = await rpc.live.broadcastTransaction(new Uint8Array([1, 2, 3]));
    expect(res.transactionId).toBe("tx_abc");
    expect(res.peersBroadcasted).toBe(3);
  });

  it("queries a smart contract and decodes response bytes", async () => {
    const rpc = createRpcClient({ baseUrl: "https://example.test", fetch: createTestFetch() });
    const res = await rpc.live.querySmartContract({
      contractIndex: 0,
      inputType: 0,
      input: new Uint8Array([9, 9]),
    });
    expect(res.responseBase64).toBe("AA==");
    expect(Array.from(res.responseBytes)).toEqual([0]);
  });

  it("calls query getTransactionByHash and parses fields", async () => {
    const rpc = createRpcClient({ baseUrl: "https://example.test", fetch: createTestFetch() });
    const tx = await rpc.query.getTransactionByHash("deadbeef");
    expect(tx.amount).toBe(42n);
    expect(tx.moneyFlew).toBe(true);
  });

  it("calls query getProcessedTickIntervals", async () => {
    const rpc = createRpcClient({ baseUrl: "https://example.test", fetch: createTestFetch() });
    const intervals = await rpc.query.getProcessedTickIntervals();
    expect(intervals.length).toBe(2);
    expect(mustGet(intervals, 0).epoch).toBe(1n);
    expect(mustGet(intervals, 1).lastTick).toBe(20n);
  });

  it("calls query getComputorListsForEpoch", async () => {
    const rpc = createRpcClient({ baseUrl: "https://example.test", fetch: createTestFetch() });
    const lists = await rpc.query.getComputorListsForEpoch(1);
    expect(lists.length).toBe(1);
    expect(mustGet(lists, 0).epoch).toBe(1n);
    expect(mustGet(lists, 0).identities).toEqual(["A", "B"]);
  });

  it("throws RpcError on non-2xx responses", async () => {
    const rpc = createRpcClient({ baseUrl: "https://example.test", fetch: createTestFetch() });
    await expect(rpc.query.getTransactionsForTick(1)).rejects.toBeInstanceOf(RpcError);
  });

  it("invokes onRequest/onResponse/onError hooks", async () => {
    const requests: string[] = [];
    const responses: number[] = [];
    const errors: RpcError[] = [];
    const rpc = createRpcClient({
      baseUrl: "https://example.test",
      fetch: createTestFetch(),
      onRequest: (info) => requests.push(`${info.method} ${info.url}`),
      onResponse: (info) => responses.push(info.status),
      onError: (err) => errors.push(err),
    });

    await rpc.live.tickInfo();
    await expect(rpc.query.getTransactionsForTick(1)).rejects.toBeInstanceOf(RpcError);

    expect(requests.length).toBeGreaterThan(0);
    expect(responses.length).toBeGreaterThan(0);
    expect(errors.length).toBe(1);
    expect(errors[0]?.code).toBe("rpc_request_failed");
  });
});

function mustGet<T>(arr: readonly T[], index: number): T {
  const value = arr[index];
  if (value === undefined) throw new Error(`Missing index: ${index}`);
  return value;
}
