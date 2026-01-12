import { describe, expect, it } from "bun:test";
import {
  AssetRecordType,
  encodeRequestAssetsByFilter,
  encodeRequestAssetsByUniverseIndex,
  publicKeyFromIdentity,
  writeI64LE,
} from "@qubic-labs/core";
import { createAssetsHelpers } from "./assets.js";

const zeroId = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFXIB";
const RESPOND_ASSETS_PAYLOAD_SIZE = 56;
const RESPOND_ASSETS_WITH_SIBLINGS_PAYLOAD_SIZE = 824;
const RequestAssetsType = {
  ISSUANCE: 0,
  OWNERSHIP: 1,
  POSSESSION: 2,
  BY_UNIVERSE_INDEX: 3,
} as const;

describe("assets helpers", () => {
  it("listIssued encodes filter and decodes response", async () => {
    const payload = new Uint8Array(RESPOND_ASSETS_PAYLOAD_SIZE);
    payload[32] = AssetRecordType.ISSUANCE;
    const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
    view.setUint32(48, 7, true);
    view.setUint32(52, 9, true);

    const expectedRequest = encodeRequestAssetsByFilter({
      requestType: RequestAssetsType.ISSUANCE,
      issuerPublicKey32: publicKeyFromIdentity(zeroId),
      assetNameU64LE: assetNameToU64LE("ASSET"),
    });

    const assets = createAssetsHelpers({
      requestAssets: async (request) => {
        expect(bytesEqual(request.slice(8), expectedRequest.slice(8))).toBe(true);
        return [payload];
      },
    });

    const res = await assets.listIssued({
      issuerIdentity: zeroId,
      assetName: "ASSET",
    });

    expect(res.length).toBe(1);
    expect(res[0]?.tick).toBe(7);
    expect(res[0]?.universeIndex).toBe(9);
    expect(res[0]?.asset.type).toBe(AssetRecordType.ISSUANCE);
  });

  it("listOwned decodes siblings response", async () => {
    const payload = new Uint8Array(RESPOND_ASSETS_WITH_SIBLINGS_PAYLOAD_SIZE);
    payload[32] = AssetRecordType.OWNERSHIP;
    const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
    view.setUint16(34, 12, true);
    view.setUint32(36, 99, true);
    writeI64LE(123n, payload, 40);

    const assets = createAssetsHelpers({
      requestAssets: async () => [payload],
    });

    const res = await assets.listOwned({
      ownerIdentity: zeroId,
      getSiblings: true,
    });

    expect(res.length).toBe(1);
    const first = res[0];
    expect(first).toBeDefined();
    if (!first) throw new Error("Missing assets response");
    expect("siblings" in first).toBe(true);
    const record = first.asset;
    expect(record.type).toBe(AssetRecordType.OWNERSHIP);
  });

  it("listByUniverseIndex encodes request", async () => {
    const expectedRequest = encodeRequestAssetsByUniverseIndex({
      universeIndex: 123,
      getSiblings: false,
    });

    const assets = createAssetsHelpers({
      requestAssets: async (request) => {
        expect(bytesEqual(request.slice(8), expectedRequest.slice(8))).toBe(true);
        return [new Uint8Array(RESPOND_ASSETS_PAYLOAD_SIZE)];
      },
    });

    await assets.listByUniverseIndex({ universeIndex: 123 });
  });
});

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function assetNameToU64LE(name: string): bigint {
  if (name.length > 8) throw new RangeError("assetName must be <= 8 characters");
  const bytes = new Uint8Array(8);
  for (let i = 0; i < name.length; i++) {
    const c = name.charCodeAt(i);
    if (c < 32 || c > 126) throw new Error("assetName must be ASCII");
    bytes[i] = c;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return view.getBigUint64(0, true);
}
