# Releasing `@qubic-labs/sdk`

This package is designed to be released with an automated pipeline (semantic versioning + npm publish).

## Current status

- CI is set up in `jskit-sdk/.github/workflows/ci.yml`.
- Release automation is wired in `jskit-sdk/.github/workflows/release.yml` and uses semantic-release.
  - The workflow skips when `NPM_TOKEN` is missing.
  - Releases publish to npm and create GitHub releases on `main`.

## Usage

- Ensure `NPM_TOKEN` is configured in GitHub Actions secrets.
- Push to `main` or run the workflow manually.
- The release job runs `bun run check`, `bun test`, `bun run build`, then `bun run release`.
