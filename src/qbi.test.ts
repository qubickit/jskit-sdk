import { describe, expect, it } from "bun:test";
import type { ContractsHelpers } from "./contracts.js";
import { createQbiHelpers, createQbiRegistry } from "./qbi.js";

describe("qbi helpers", () => {
  it("resolves entries and uses outputSize for queryRaw", async () => {
    let lastInputType: number | undefined;
    let lastExpectedSize: number | undefined;

    const contracts: ContractsHelpers = {
      async queryRaw(input) {
        lastInputType = Number(input.inputType);
        lastExpectedSize = input.expectedOutputSize;
        return {
          responseBytes: new Uint8Array([1, 2, 3, 4]),
          responseBase64: "AQIDBA==",
          attempts: 1,
        };
      },
      async querySmartContract() {
        throw new Error("not used");
      },
    };

    const registry = createQbiRegistry({
      files: [
        {
          contract: { name: "QX", contractIndex: 1 },
          entries: [{ kind: "function", name: "Fees", inputType: 1, inputSize: 0, outputSize: 16 }],
        },
      ],
    });

    const qbi = createQbiHelpers({ contracts, registry });
    const res = await qbi.contract("QX").query("Fees", { inputBytes: new Uint8Array() });
    expect(res.responseBytes.length).toBe(4);
    expect(lastInputType).toBe(1);
    expect(lastExpectedSize).toBe(16);
  });
});
