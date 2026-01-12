import { describe, expect, it } from "bun:test";
import { createSdk } from "./sdk.js";

describe("sdk scaffold", () => {
  it("creates a sdk object", () => {
    const sdk = createSdk();
    expect(sdk).toHaveProperty("rpc");
    expect(sdk).toHaveProperty("tx");
    expect(sdk).toHaveProperty("txQueue");
    expect(sdk).toHaveProperty("tick");
    expect(sdk).toHaveProperty("transactions");
    expect(sdk).toHaveProperty("transfers");
    expect(sdk).toHaveProperty("contracts");
    expect(sdk).toHaveProperty("bob");
  });
});
