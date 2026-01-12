import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openSeedVault } from "./vault.js";

const SEED = "jvhbyzjinlyutyuhsweuxiwootqoevjqwqmdhjeohrytxjxidpbcfyg";

let currentDir: string | undefined;

afterEach(async () => {
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
    const entry = await vault.addSeed({ name: "main", seed: SEED });

    expect(entry.name).toBe("main");
    expect(entry.identity.length).toBe(60);

    const seed = await vault.getSeed("main");
    expect(seed).toBe(SEED);

    const reopened = await openSeedVault({ path: vaultPath, passphrase: "secret" });
    const seedReloaded = await reopened.getSeed(entry.identity);
    expect(seedReloaded).toBe(SEED);
  });

  it("rotates the passphrase", async () => {
    currentDir = await mkdtemp(join(tmpdir(), "sdk-vault-"));
    const vaultPath = join(currentDir, "vault.json");

    const vault = await openSeedVault({ path: vaultPath, passphrase: "secret", create: true });
    await vault.addSeed({ name: "main", seed: SEED });

    await vault.rotatePassphrase("new-secret");

    const reopened = await openSeedVault({ path: vaultPath, passphrase: "new-secret" });
    const seedReloaded = await reopened.getSeed("main");
    expect(seedReloaded).toBe(SEED);
  });
});
