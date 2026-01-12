import { openSeedVault } from "../src/vault.js";

const vaultPath = process.env.QUBIC_VAULT_PATH ?? "./vault.json";
const passphrase = process.env.QUBIC_VAULT_PASSPHRASE;
const seed = process.env.QUBIC_SEED;

if (!passphrase) throw new Error("Missing env var: QUBIC_VAULT_PASSPHRASE");

const vault = await openSeedVault({ path: vaultPath, passphrase, create: true });

if (seed) {
  const entry = await vault.addSeed({ name: "main", seed, overwrite: true });
  console.log({ added: entry.identity });
}

console.log(vault.list());

const exportPath = process.env.QUBIC_VAULT_EXPORT_PATH;
if (exportPath) {
  await Bun.write(exportPath, vault.exportJson());
  console.log({ exported: exportPath });
}
