# Seed Vault

The seed vault stores one or more seeds in an encrypted JSON file protected by a passphrase. It is file-based (no network dependency), supports multiple identities, and works in both Node.js and Bun.

## Create or open a vault

```ts
import { createSdk, openSeedVault } from "@qubic-labs/sdk";

const vault = await openSeedVault({
  path: "./vault.json",
  passphrase: process.env.VAULT_PASSPHRASE ?? "dev-passphrase",
  create: true,
});

const sdk = createSdk({ baseUrl: "https://rpc.qubic.org", vault });
```

## Add and fetch seeds

```ts
await vault.addSeed({ name: "main", seed: "..." });

const seed = await vault.getSeed("main");
const seedByIdentity = await vault.getSeed("IDENTITY60...");

console.log(vault.list());
```

Using the vault with SDK helpers:

```ts
const fromSeed = await vault.getSeed("main");
await sdk.transfers.sendAndConfirm({
  fromSeed,
  toIdentity: "DESTINATION_IDENTITY",
  amount: 1n,
});
```

## Rotate the passphrase

```ts
await vault.rotatePassphrase("new-passphrase");
```

## Notes

- The vault uses scrypt (KDF) + AES-256-GCM for encryption.
- You can tune scrypt parameters via `openSeedVault({ kdfParams: { N, r, p, dkLen } })`.
- Each entry has its own nonce and auth tag.
- Writes are atomic (`.tmp` then rename).
- Use a strong passphrase and keep the vault file in a secure location.
