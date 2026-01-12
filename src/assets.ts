import {
  type AssetRecord,
  AssetRecordType,
  decodeRespondAssets,
  decodeRespondAssetsWithSiblings,
  encodeRequestAssetsByFilter,
  encodeRequestAssetsByUniverseIndex,
  publicKeyFromIdentity,
  type RespondAssets,
  type RespondAssetsWithSiblings,
} from "@qubic-labs/core";

const RESPOND_ASSETS_PAYLOAD_SIZE = 56;
const RESPOND_ASSETS_WITH_SIBLINGS_PAYLOAD_SIZE = 824;
const RequestAssetsType = {
  ISSUANCE: 0,
  OWNERSHIP: 1,
  POSSESSION: 2,
  BY_UNIVERSE_INDEX: 3,
} as const;

export type AssetsRequestFn = (
  request: Uint8Array,
  signal?: AbortSignal,
) => Promise<readonly Uint8Array[]>;

export type AssetsHelpersConfig = Readonly<{
  requestAssets: AssetsRequestFn;
}>;

export type AssetsQueryInput = Readonly<{
  getSiblings?: boolean;
  signal?: AbortSignal;
}>;

export type ListIssuedInput = AssetsQueryInput &
  Readonly<{
    issuerIdentity?: string;
    assetName?: string;
  }>;

export type ListOwnedInput = AssetsQueryInput &
  Readonly<{
    ownerIdentity?: string;
    issuerIdentity?: string;
    assetName?: string;
    managingContractIndex?: number;
  }>;

export type ListPossessedInput = AssetsQueryInput &
  Readonly<{
    possessorIdentity?: string;
    issuerIdentity?: string;
    assetName?: string;
    managingContractIndex?: number;
  }>;

export type AssetsHelpers = Readonly<{
  listIssued(
    input: ListIssuedInput,
  ): Promise<readonly (RespondAssets | RespondAssetsWithSiblings)[]>;
  listOwned(input: ListOwnedInput): Promise<readonly (RespondAssets | RespondAssetsWithSiblings)[]>;
  listPossessed(
    input: ListPossessedInput,
  ): Promise<readonly (RespondAssets | RespondAssetsWithSiblings)[]>;
  listByUniverseIndex(input: {
    universeIndex: number;
    getSiblings?: boolean;
    signal?: AbortSignal;
  }): Promise<readonly (RespondAssets | RespondAssetsWithSiblings)[]>;
}>;

export function createAssetsHelpers(config: AssetsHelpersConfig): AssetsHelpers {
  const requestAssets = config.requestAssets;

  const decodeResponses = (payloads: readonly Uint8Array[]) =>
    payloads.map((payload) => {
      if (payload.byteLength === RESPOND_ASSETS_WITH_SIBLINGS_PAYLOAD_SIZE) {
        return decodeRespondAssetsWithSiblings(payload);
      }
      if (payload.byteLength === RESPOND_ASSETS_PAYLOAD_SIZE) {
        return decodeRespondAssets(payload);
      }
      throw new RangeError("Unexpected RespondAssets payload length");
    });

  return {
    async listIssued(input: ListIssuedInput) {
      const request = encodeRequestAssetsByFilter({
        requestType: RequestAssetsType.ISSUANCE,
        getSiblings: input.getSiblings,
        issuerPublicKey32: input.issuerIdentity
          ? publicKeyFromIdentity(input.issuerIdentity)
          : undefined,
        assetNameU64LE: input.assetName ? assetNameToU64LE(input.assetName) : undefined,
      });
      return decodeResponses(await requestAssets(request, input.signal));
    },

    async listOwned(input: ListOwnedInput) {
      const request = encodeRequestAssetsByFilter({
        requestType: RequestAssetsType.OWNERSHIP,
        getSiblings: input.getSiblings,
        issuerPublicKey32: input.issuerIdentity
          ? publicKeyFromIdentity(input.issuerIdentity)
          : undefined,
        assetNameU64LE: input.assetName ? assetNameToU64LE(input.assetName) : undefined,
        ownerPublicKey32: input.ownerIdentity
          ? publicKeyFromIdentity(input.ownerIdentity)
          : undefined,
        ownershipManagingContractIndex: input.managingContractIndex,
      });
      return decodeResponses(await requestAssets(request, input.signal));
    },

    async listPossessed(input: ListPossessedInput) {
      const request = encodeRequestAssetsByFilter({
        requestType: RequestAssetsType.POSSESSION,
        getSiblings: input.getSiblings,
        issuerPublicKey32: input.issuerIdentity
          ? publicKeyFromIdentity(input.issuerIdentity)
          : undefined,
        assetNameU64LE: input.assetName ? assetNameToU64LE(input.assetName) : undefined,
        possessorPublicKey32: input.possessorIdentity
          ? publicKeyFromIdentity(input.possessorIdentity)
          : undefined,
        possessionManagingContractIndex: input.managingContractIndex,
      });
      return decodeResponses(await requestAssets(request, input.signal));
    },

    async listByUniverseIndex(input) {
      const request = encodeRequestAssetsByUniverseIndex({
        universeIndex: input.universeIndex,
        getSiblings: input.getSiblings,
      });
      return decodeResponses(await requestAssets(request, input.signal));
    },
  };
}

export function isIssuanceAsset(
  record: AssetRecord,
): record is AssetRecord & { type: typeof AssetRecordType.ISSUANCE } {
  return record.type === AssetRecordType.ISSUANCE;
}

export function isOwnershipAsset(
  record: AssetRecord,
): record is AssetRecord & { type: typeof AssetRecordType.OWNERSHIP } {
  return record.type === AssetRecordType.OWNERSHIP;
}

export function isPossessionAsset(
  record: AssetRecord,
): record is AssetRecord & { type: typeof AssetRecordType.POSSESSION } {
  return record.type === AssetRecordType.POSSESSION;
}

function assetNameToU64LE(name: string): bigint {
  if (typeof name !== "string") {
    throw new TypeError("assetName must be a string");
  }
  if (name.length > 8) {
    throw new RangeError("assetName must be <= 8 characters");
  }
  const bytes = new Uint8Array(8);
  for (let i = 0; i < name.length; i++) {
    const c = name.charCodeAt(i);
    if (c < 32 || c > 126) throw new Error("assetName must be ASCII");
    bytes[i] = c;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return view.getBigUint64(0, true);
}
