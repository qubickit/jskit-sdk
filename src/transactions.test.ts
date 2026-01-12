import { describe, expect, it } from "bun:test";
import {
  buildSignedTransaction,
  privateKeyFromSeed,
  publicKeyFromIdentity,
  publicKeyFromSeed,
  transactionId,
} from "@qubic-labs/core";
import type { TickHelpers } from "./tick.js";
import { createTransactionHelpers } from "./transactions.js";
import type { TxHelpers } from "./tx/tx.js";

describe("transactions", () => {
  it("builds the same signed tx as core (generic inputType + bytes)", async () => {
    const seed = "jvhbyzjinlyutyuhsweuxiwootqoevjqwqmdhjeohrytxjxidpbcfyg";
    const toIdentity = "AFZPUAIYVPNUYGJRQVLUKOPPVLHAZQTGLYAAUUNBXFTVTAMSBKQBLEIEPCVJ";
    const targetTick = 12345n;
    const inputType = 7;
    const inputBytes = new Uint8Array([1, 2, 3, 4]);

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
      async waitForConfirmedTransaction() {
        throw new Error("not used");
      },
    };

    const transactions = createTransactionHelpers({ tick, tx });
    const built = await transactions.buildSigned({
      fromSeed: seed,
      toIdentity,
      amount: 1n,
      targetTick,
      inputType,
      inputBytes,
    });

    const sourcePublicKey32 = await publicKeyFromSeed(seed);
    const destinationPublicKey32 = publicKeyFromIdentity(toIdentity);
    const secretKey32 = await privateKeyFromSeed(seed);
    const expected = await buildSignedTransaction(
      {
        sourcePublicKey32,
        destinationPublicKey32,
        amount: 1n,
        tick: 12345,
        inputType,
        inputBytes,
      },
      secretKey32,
    );
    const expectedId = await transactionId(expected);

    expect(built.targetTick).toBe(targetTick);
    expect(built.txBytes).toEqual(expected);
    expect(built.txId).toBe(expectedId);
  });
});
