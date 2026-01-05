import { describe, expect, it } from "bun:test";
import { createSdk } from "./sdk.js";

describe("sdk scaffold", () => {
  it("creates a sdk object", () => {
    expect(createSdk()).toHaveProperty("rpc");
    expect(createSdk()).toHaveProperty("tx");
    expect(createSdk()).toHaveProperty("tick");
  });
});
