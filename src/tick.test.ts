import { describe, expect, it } from "bun:test";
import type { RpcClient } from "./rpc/client.js";
import { createTickHelpers } from "./tick.js";

function createMockRpc(tick: bigint): RpcClient {
  return {
    live: {
      async tickInfo() {
        return { tick, duration: 0n, epoch: 0n, initialTick: 0n };
      },
      async balance() {
        throw new Error("not implemented");
      },
      async broadcastTransaction() {
        throw new Error("not implemented");
      },
      async querySmartContract() {
        throw new Error("not implemented");
      },
    },
    query: {
      async getLastProcessedTick() {
        throw new Error("not implemented");
      },
      async getTransactionByHash() {
        throw new Error("not implemented");
      },
      async getTransactionsForIdentity() {
        throw new Error("not implemented");
      },
      async getTransactionsForTick() {
        throw new Error("not implemented");
      },
      async getTickData() {
        throw new Error("not implemented");
      },
      async getProcessedTickIntervals() {
        throw new Error("not implemented");
      },
      async getComputorListsForEpoch() {
        throw new Error("not implemented");
      },
    },
  };
}

describe("tick helpers", () => {
  it("uses default offset (15) with guardrails", async () => {
    const tick = createTickHelpers({ rpc: createMockRpc(100n) });
    await expect(tick.getSuggestedTargetTick()).resolves.toBe(115n);
  });

  it("rejects offsets below minOffset", async () => {
    const tick = createTickHelpers({ rpc: createMockRpc(0n), minOffset: 5, defaultOffset: 5 });
    await expect(tick.getSuggestedTargetTick({ offset: 4 })).rejects.toBeInstanceOf(RangeError);
  });

  it("rejects offsets above maxOffset", async () => {
    const tick = createTickHelpers({ rpc: createMockRpc(0n), maxOffset: 10, defaultOffset: 10 });
    await expect(tick.getSuggestedTargetTick({ offset: 11 })).rejects.toBeInstanceOf(RangeError);
  });
});
