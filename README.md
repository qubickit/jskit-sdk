# @qubic-labs/sdk

High-level SDK for Qubic apps. This package composes `@qubic-labs/core` and will host:

- RPC clients (Query/Live)
- Transaction workflows (tick selection, per-source TxQueue)
- Contract helpers and ergonomic domain APIs
- QubicBob indexer client + log streaming helpers

Core primitives/codecs/transports live in `@qubic-labs/core`.

## Install

```bash
bun add @qubic-labs/sdk
```

## Local development (monorepo)

If you’re developing `@qubic-labs/core` and `@qubic-labs/sdk` together before the first npm release, you can temporarily use a local dependency:

```bash
# from jskit-sdk/
bun add @qubic-labs/core@file:../jskit-core
```

## Status

RPC + tx workflows are available. Next: higher-level contract helpers and indexer clients.

## Public API

- `createSdk()` is the main entrypoint.
- Avoid deep imports (`src/...`) in apps; they’re not considered stable.

## Quick start

```ts
import { createSdk } from "@qubic-labs/sdk";

const sdk = createSdk({
  baseUrl: "https://rpc.qubic.org",
  tick: { defaultOffset: 15 }, // currentTick + 15
  tx: { confirmTimeoutMs: 60_000, confirmPollIntervalMs: 1_000 },
  txQueue: { enabled: true, policy: "waitForConfirm" },
  bob: { baseUrl: "http://localhost:40420" },
});
const tickInfo = await sdk.rpc.live.tickInfo();
const targetTick = await sdk.tick.getSuggestedTargetTick(); // currentTick + 15

// generic tx builder (inputType + inputBytes is future QBI integration point)
// const tx = await sdk.transactions.buildSigned({
//   fromSeed,
//   toIdentity,
//   amount: 1n,
//   targetTick,
//   inputType: 0,
//   inputBytes: new Uint8Array(),
// });

// queued send (enforces “one concurrent tx per source identity”)
// const sent = await sdk.transactions.sendQueued({
//   fromSeed,
//   toIdentity,
//   amount: 1n,
//   targetTick,
// });

// `sendAndConfirm` uses the queue by default when available.
// transfer helper (wraps sdk.transactions with inputType=0)
// const res = await sdk.transfers.sendAndConfirm({
//   fromSeed,
//   toIdentity,
//   amount: 1n,
//   targetTick,
// });

// confirmation receipt (returns QueryTransaction from the archive)
// const receipt = await sdk.transfers.sendAndConfirmWithReceipt({
//   fromSeed,
//   toIdentity,
//   amount: 1n,
//   targetTick,
// });

// raw contract query (RPC live)
// const res = await sdk.contracts.queryRaw({
//   contractIndex: 1,
//   inputType: 1,
//   inputBytes: new Uint8Array(),
//   expectedOutputSize: 32,
// });

// QubicBob REST client
// const status = await sdk.bob.status();

// QubicBob log stream (WS)
// const stream = createLogStream({
//   baseUrl: "http://localhost:40420",
//   subscriptions: [{ scIndex: 0, logType: 0 }],
//   onLog: (msg) => console.log(msg),
// });
```

## Examples

See `jskit-sdk/examples/README.md`.

## Releasing

See `jskit-sdk/docs/releasing.md`.
