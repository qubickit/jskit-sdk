import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SeedVault } from "./vault.js";
import { openSeedVault } from "./vault.js";

const SEED = "jvhbyzjinlyutyuhsweuxiwootqoevjqwqmdhjeohrytxjxidpbcfyg";

let currentDir: string | undefined;
let vaults: SeedVault[] = [];

afterEach(async () => {
  for (const vault of vaults) {
    await vault.close();
  }
  vaults = [];
  if (currentDir) {
    await rm(currentDir, { recursive: true, force: true });
    currentDir = undefined;
  }
});

describe("seed vault", () => {
  it("creates a vault, stores a seed, and reloads it", async () => {
    currentDir = await mkdtemp(join(tmpdir(), "sdk-vault-"));
    const vaultPath = join(currentDir, "vault.json");

    const vault = await openSeedVault({ path: vaultPath, passphrase: "secret", create: true });
    vaults.push(vault);
    const entry = await vault.addSeed({ name: "main", seed: SEED });

    expect(entry.name).toBe("main");
    expect(entry.identity.length).toBe(60);

    const seed = await vault.getSeed("main");
    expect(seed).toBe(SEED);

    await vault.close();
    const reopened = await openSeedVault({ path: vaultPath, passphrase: "secret" });
    vaults.push(reopened);
    const seedReloaded = await reopened.getSeed(entry.identity);
    expect(seedReloaded).toBe(SEED);
  });

  it("rotates the passphrase", async () => {
    currentDir = await mkdtemp(join(tmpdir(), "sdk-vault-"));
    const vaultPath = join(currentDir, "vault.json");

    const vault = await openSeedVault({ path: vaultPath, passphrase: "secret", create: true });
    vaults.push(vault);
    await vault.addSeed({ name: "main", seed: SEED });

    await vault.rotatePassphrase("new-secret");

    await vault.close();
    const reopened = await openSeedVault({ path: vaultPath, passphrase: "new-secret" });
    vaults.push(reopened);
    const seedReloaded = await reopened.getSeed("main");
    expect(seedReloaded).toBe(SEED);
  });

  it("imports encrypted exports from another vault", async () => {
    currentDir = await mkdtemp(join(tmpdir(), "sdk-vault-"));
    const vaultPath = join(currentDir, "vault.json");
    const vaultPathTwo = join(currentDir, "vault-two.json");

    const vault = await openSeedVault({ path: vaultPath, passphrase: "secret", create: true });
    vaults.push(vault);
    await vault.addSeed({ name: "main", seed: SEED });

    const exported = vault.exportJson();

    const vaultTwo = await openSeedVault({
      path: vaultPathTwo,
      passphrase: "secret",
      create: true,
    });
    vaults.push(vaultTwo);
    await vaultTwo.importEncrypted(exported, { mode: "merge", sourcePassphrase: "secret" });

    const seedReloaded = await vaultTwo.getSeed("main");
    expect(seedReloaded).toBe(SEED);
  });
});
