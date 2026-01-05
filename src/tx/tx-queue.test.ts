import { describe, expect, it } from "bun:test";
import { TxQueue, TxQueueError } from "./tx-queue.js";

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject } as const;
}

describe("TxQueue", () => {
  it("waits for confirmation by default (single tx per source)", async () => {
    const confirmations = new Map<string, ReturnType<typeof createDeferred<void>>>();
    const submitOrder: string[] = [];

    const q = new TxQueue({
      async confirm({ txId, signal }) {
        if (signal.aborted) throw new Error("aborted");
        const d = confirmations.get(txId);
        if (!d) throw new Error(`missing deferred for ${txId}`);
        return d.promise;
      },
    });

    confirmations.set("tx1", createDeferred<void>());
    confirmations.set("tx2", createDeferred<void>());

    const p1 = q.enqueue({
      sourceIdentity: "A",
      targetTick: 10,
      async submit() {
        submitOrder.push("tx1");
        return { txId: "tx1", result: "r1" };
      },
    });

    const p2 = q.enqueue({
      sourceIdentity: "A",
      targetTick: 11,
      async submit() {
        submitOrder.push("tx2");
        return { txId: "tx2", result: "r2" };
      },
    });

    await Promise.resolve();
    expect(submitOrder).toEqual(["tx1"]);

    mustGet(confirmations, "tx1").resolve();
    const r1 = await p1;
    expect(r1.status).toBe("confirmed");

    mustGet(confirmations, "tx2").resolve();
    const r2 = await p2;
    expect(r2.status).toBe("confirmed");
    expect(submitOrder).toEqual(["tx1", "tx2"]);
  });

  it("rejects enqueue when policy is reject", async () => {
    const confirmations = new Map<string, ReturnType<typeof createDeferred<void>>>();
    confirmations.set("tx1", createDeferred<void>());

    const q = new TxQueue({
      policy: "reject",
      async confirm({ txId }) {
        return mustGet(confirmations, txId).promise;
      },
    });

    void q.enqueue({
      sourceIdentity: "A",
      targetTick: 10,
      async submit() {
        return { txId: "tx1", result: null };
      },
    });

    await expect(
      q.enqueue({
        sourceIdentity: "A",
        targetTick: 11,
        async submit() {
          return { txId: "tx2", result: null };
        },
      }),
    ).rejects.toBeInstanceOf(TxQueueError);

    mustGet(confirmations, "tx1").resolve();
  });

  it("replaces with higher tick when policy is replaceHigherTick", async () => {
    const confirmations = new Map<string, ReturnType<typeof createDeferred<void>>>();
    confirmations.set("tx1", createDeferred<void>());
    confirmations.set("tx2", createDeferred<void>());

    const q = new TxQueue({
      policy: "replaceHigherTick",
      async confirm({ txId, signal }) {
        if (signal.aborted) throw new Error("aborted");
        return mustGet(confirmations, txId).promise;
      },
    });

    const p1 = q.enqueue({
      sourceIdentity: "A",
      targetTick: 10,
      async submit() {
        return { txId: "tx1", result: null };
      },
    });

    const p2 = q.enqueue({
      sourceIdentity: "A",
      targetTick: 15,
      async submit() {
        return { txId: "tx2", result: null };
      },
    });

    const r1 = await p1;
    expect(r1.status).toBe("superseded");

    await expect(
      q.enqueue({
        sourceIdentity: "A",
        targetTick: 14,
        async submit() {
          return { txId: "tx3", result: null };
        },
      }),
    ).rejects.toBeInstanceOf(TxQueueError);

    mustGet(confirmations, "tx2").resolve();
    const r2 = await p2;
    expect(r2.status).toBe("confirmed");
  });
});

function mustGet<K, V>(map: ReadonlyMap<K, V>, key: K): V {
  const value = map.get(key);
  if (!value) throw new Error(`Missing key: ${String(key)}`);
  return value;
}
