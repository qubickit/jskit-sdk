# Seed Vault

The seed vault stores one or more seeds in an encrypted JSON blob protected by a passphrase. Node uses a file-based vault, while browsers use a storage-backed vault.

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

await sdk.transfers.sendAndConfirm({
  fromVault: "main",
  toIdentity: "DESTINATION_IDENTITY",
  amount: 1n,
});

await sdk.transfers.sendAndConfirmFromVault({
  fromVault: "main",
  toIdentity: "DESTINATION_IDENTITY",
  amount: 1n,
});
```

## Rotate the passphrase

```ts
await vault.rotatePassphrase("new-passphrase");
```

## Import/export

```ts
const backup = vault.exportJson();
await vault.importEncrypted(backup, { mode: "merge", sourcePassphrase: "secret" });
```

## Browser vaults

Browser vaults use the same format but store data in a custom storage backend.

```ts
import { createLocalStorageVaultStore, openSeedVaultBrowser } from "@qubic-labs/sdk";

const store = createLocalStorageVaultStore("qubic.vault");
const vault = await openSeedVaultBrowser({
  store,
  passphrase: "secret",
  create: true,
});
```

Custom storage example:

```ts
const store = {
  async read() {
    return await loadFromIndexedDb();
  },
  async write(value: string) {
    await saveToIndexedDb(value);
  },
};
```

## CLI

```bash
qubic-vault init --path ./vault.json --passphrase "secret"
qubic-vault add --path ./vault.json --passphrase "secret" --name main --seed "..."
qubic-vault list --path ./vault.json --passphrase "secret"
qubic-vault rotate --path ./vault.json --passphrase "secret" --new-passphrase "next"
qubic-vault export --path ./vault.json --passphrase "secret" --out vault-backup.json
qubic-vault import --path ./vault.json --passphrase "secret" --file vault-backup.json --mode merge
```

## Other helpers

```ts
const signer = vault.signer("main"); // { fromVault: "main" }
await sdk.transfers.sendAndConfirm({ ...signer, toIdentity: "DEST", amount: 1n });
```

## Notes

- The vault uses scrypt (KDF) + AES-256-GCM for encryption.
- You can tune scrypt parameters via `openSeedVault({ kdfParams: { N, r, p, dkLen } })`.
- Each entry has its own nonce and auth tag.
- Vault files are locked by default (`.lock` file). Disable with `openSeedVault({ lock: false })`.
- Writes are atomic (`.tmp` then rename).
- Use a strong passphrase and keep the vault file in a secure location.
