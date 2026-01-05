import type { RpcClient } from "./rpc/client.js";

export type TickHelpersConfig = Readonly<{
  rpc: RpcClient;
  minOffset?: bigint | number;
  defaultOffset?: bigint | number;
  maxOffset?: bigint | number;
}>;

export type SuggestedTargetTickInput = Readonly<{ offset?: bigint | number }>;

export type TickHelpers = Readonly<{
  getSuggestedTargetTick(input?: SuggestedTargetTickInput): Promise<bigint>;
}>;

export function createTickHelpers(config: TickHelpersConfig): TickHelpers {
  const minOffset = toBigint(config.minOffset ?? 5);
  const defaultOffset = toBigint(config.defaultOffset ?? 15);
  const maxOffset = toBigint(config.maxOffset ?? 300);

  if (minOffset < 0n) throw new RangeError("minOffset must be >= 0");
  if (defaultOffset < 0n) throw new RangeError("defaultOffset must be >= 0");
  if (maxOffset < 0n) throw new RangeError("maxOffset must be >= 0");
  if (minOffset > maxOffset) throw new RangeError("minOffset must be <= maxOffset");

  return {
    async getSuggestedTargetTick(input: SuggestedTargetTickInput = {}): Promise<bigint> {
      const offset = toBigint(input.offset ?? defaultOffset);
      if (offset < minOffset) {
        throw new RangeError(`offset must be >= ${minOffset}`);
      }
      if (offset > maxOffset) {
        throw new RangeError(`offset must be <= ${maxOffset}`);
      }
      const { tick } = await config.rpc.live.tickInfo();
      return tick + offset;
    },
  };
}

function toBigint(value: bigint | number): bigint {
  if (typeof value === "bigint") return value;
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new TypeError("Expected an integer");
  }
  return BigInt(value);
}
