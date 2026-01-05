import { describe, expect, it } from "bun:test";
import {
  buildSignedTransaction,
  privateKeyFromSeed,
  publicKeyFromIdentity,
  publicKeyFromSeed,
  transactionId,
} from "@qubic-labs/core";
import type { TickHelpers } from "./tick.js";
import { createTransferHelpers } from "./transfers.js";
import type { TxHelpers } from "./tx/tx.js";

describe("transfers", () => {
  it("builds the same signed tx as core (simple transfer)", async () => {
    const seed = "jvhbyzjinlyutyuhsweuxiwootqoevjqwqmdhjeohrytxjxidpbcfyg";
    const toIdentity = "AFZPUAIYVPNUYGJRQVLUKOPPVLHAZQTGLYAAUUNBXFTVTAMSBKQBLEIEPCVJ";
    const targetTick = 12345n;

    const tick: TickHelpers = {
      async getSuggestedTargetTick() {
        return 999n;
      },
    };
    const tx: TxHelpers = {
      async broadcastSigned() {
        throw new Error("not used");
      },
      async waitForConfirmation() {
        throw new Error("not used");
      },
    };

    const transfers = createTransferHelpers({ tick, tx });
    const built = await transfers.buildSignedTransfer({
      fromSeed: seed,
      toIdentity,
      amount: 1n,
      targetTick,
    });

    const sourcePublicKey32 = await publicKeyFromSeed(seed);
    const destinationPublicKey32 = publicKeyFromIdentity(toIdentity);
    const secretKey32 = await privateKeyFromSeed(seed);
    const expected = await buildSignedTransaction(
      { sourcePublicKey32, destinationPublicKey32, amount: 1n, tick: 12345 },
      secretKey32,
    );
    const expectedId = await transactionId(expected);

    expect(built.targetTick).toBe(targetTick);
    expect(built.txBytes).toEqual(expected);
    expect(built.txId).toBe(expectedId);
  });
});
