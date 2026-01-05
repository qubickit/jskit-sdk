import { describe, expect, it } from "bun:test";
import type { BroadcastTransactionResult } from "./rpc/client.js";
import { createTransactionHelpers } from "./transactions.js";
import type { TxHelpers } from "./tx/tx.js";
import { TxQueue } from "./tx/tx-queue.js";

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject } as const;
}

describe("transactions (queued)", () => {
  it("enforces one in-flight tx per source identity", async () => {
    const confirmations = new Map<string, ReturnType<typeof createDeferred<void>>>();
    const broadcastOrder: string[] = [];

    const tx: TxHelpers = {
      async broadcastSigned() {
        const txId = `tx${broadcastOrder.length + 1}`;
        broadcastOrder.push(txId);
        confirmations.set(txId, createDeferred<void>());
        const res: BroadcastTransactionResult = {
          peersBroadcasted: 1,
          encodedTransaction: "",
          transactionId: txId,
        };
        return res;
      },
      async waitForConfirmation({ txId }) {
        const d = confirmations.get(txId);
        if (!d) throw new Error(`missing deferred for ${txId}`);
        await d.promise;
      },
    };

    const txQueue = new TxQueue({
      confirm: ({ txId, targetTick, signal }) =>
        tx.waitForConfirmation({ txId, targetTick, signal }),
    });

    const transactions = createTransactionHelpers({
      tick: {
        async getSuggestedTargetTick() {
          return 100n;
        },
      },
      tx,
      txQueue,
    });

    const seed = "jvhbyzjinlyutyuhsweuxiwootqoevjqwqmdhjeohrytxjxidpbcfyg";
    const toIdentity = "AFZPUAIYVPNUYGJRQVLUKOPPVLHAZQTGLYAAUUNBXFTVTAMSBKQBLEIEPCVJ";

    const p1 = transactions.sendQueued({
      fromSeed: seed,
      toIdentity,
      amount: 1n,
      targetTick: 10n,
    });
    const p2 = transactions.sendQueued({
      fromSeed: seed,
      toIdentity,
      amount: 1n,
      targetTick: 11n,
    });

    await waitFor(() => broadcastOrder.length === 1);
    expect(broadcastOrder).toEqual(["tx1"]);

    mustGet(confirmations, "tx1").resolve();
    const r1 = await p1;
    expect(r1.networkTxId).toBe("tx1");

    await waitFor(() => broadcastOrder.length === 2);
    mustGet(confirmations, "tx2").resolve();
    const r2 = await p2;
    expect(r2.networkTxId).toBe("tx2");
    expect(broadcastOrder).toEqual(["tx1", "tx2"]);
  });
});

async function waitFor(condition: () => boolean, timeoutMs = 1000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error("Timed out waiting for condition");
    await Promise.resolve();
  }
}

function mustGet<K, V>(map: ReadonlyMap<K, V>, key: K): V {
  const value = map.get(key);
  if (!value) throw new Error(`Missing key: ${String(key)}`);
  return value;
}
