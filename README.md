# @qubic-labs/sdk

High-level SDK for Qubic apps. This package composes `@qubic-labs/core` and will host:

- RPC clients (Query/Live)
- Transaction workflows (tick selection, per-source TxQueue)
- Contract helpers and ergonomic domain APIs

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

Scaffolded. Next: add RPC client + workflows.
