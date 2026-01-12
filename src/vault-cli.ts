#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { openSeedVault } from "./vault.js";

const args = process.argv.slice(2);
const command = args[0];

if (!command || command === "--help" || command === "-h") {
  printHelp();
  process.exit(0);
}

const path = getArg(args, "--path") ?? "./vault.json";
const passphrase = getArg(args, "--passphrase");

if (!passphrase) {
  console.error("Missing --passphrase");
  process.exit(1);
}

const vault = await openSeedVault({ path, passphrase, create: command === "init" });

try {
  switch (command) {
    case "init":
      console.log(`Vault ready at ${path}`);
      break;
    case "list":
      console.log(JSON.stringify(vault.list(), null, 2));
      break;
    case "add": {
      const name = requiredArg(args, "--name");
      const seed = requiredArg(args, "--seed");
      const seedIndex = parseNumberArg(args, "--index");
      const overwrite = hasFlag(args, "--overwrite");
      const entry = await vault.addSeed({ name, seed, seedIndex, overwrite });
      console.log(JSON.stringify(entry, null, 2));
      break;
    }
    case "remove": {
      const name = requiredArg(args, "--name");
      await vault.remove(name);
      console.log(`Removed ${name}`);
      break;
    }
    case "rotate": {
      const newPassphrase = requiredArg(args, "--new-passphrase");
      await vault.rotatePassphrase(newPassphrase);
      console.log("Passphrase rotated");
      break;
    }
    case "export": {
      const outPath = getArg(args, "--out");
      const json = vault.exportJson();
      if (outPath) {
        await writeFile(outPath, json, "utf8");
        console.log(`Exported to ${outPath}`);
      } else {
        console.log(json);
      }
      break;
    }
    case "import": {
      const importPath = requiredArg(args, "--file");
      const mode = (getArg(args, "--mode") as "merge" | "replace" | undefined) ?? "merge";
      const sourcePassphrase = getArg(args, "--source-passphrase") ?? passphrase;
      const json = await readFile(importPath, "utf8");
      await vault.importEncrypted(json, { mode, sourcePassphrase });
      console.log(`Imported ${importPath}`);
      break;
    }
    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
} finally {
  await vault.close();
}

function getArg(argsList: readonly string[], name: string): string | undefined {
  const index = argsList.indexOf(name);
  if (index === -1) return undefined;
  return argsList[index + 1];
}

function requiredArg(argsList: readonly string[], name: string): string {
  const value = getArg(argsList, name);
  if (!value) {
    console.error(`Missing ${name}`);
    process.exit(1);
  }
  return value;
}

function parseNumberArg(argsList: readonly string[], name: string): number | undefined {
  const value = getArg(argsList, name);
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    console.error(`${name} must be an integer`);
    process.exit(1);
  }
  return parsed;
}

function hasFlag(argsList: readonly string[], name: string): boolean {
  return argsList.includes(name);
}

function printHelp() {
  console.log(`Seed vault CLI

Usage:
  qubic-vault init --path ./vault.json --passphrase "secret"
  qubic-vault list --path ./vault.json --passphrase "secret"
  qubic-vault add --path ./vault.json --passphrase "secret" --name main --seed "..." [--index 0] [--overwrite]
  qubic-vault remove --path ./vault.json --passphrase "secret" --name main
  qubic-vault rotate --path ./vault.json --passphrase "secret" --new-passphrase "next"
  qubic-vault export --path ./vault.json --passphrase "secret" [--out backup.json]
  qubic-vault import --path ./vault.json --passphrase "secret" --file backup.json [--mode merge|replace] [--source-passphrase "secret"]
`);
}
