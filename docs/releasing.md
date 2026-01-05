# Releasing `@qubic-labs/sdk`

This package is designed to be released with an automated pipeline (semantic versioning + npm publish).

## Current status

- CI is set up in `jskit-sdk/.github/workflows/ci.yml`.
- Release automation is intentionally not wired yet in this repo snapshot (it requires adding release tooling dependencies and updating `bun.lock`).

## Recommended approach

- Use the same approach as `jskit-core`:
  - semantic-release
  - publish only when `NPM_TOKEN` is available
  - generate changelog and GitHub releases

