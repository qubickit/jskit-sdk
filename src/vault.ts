import { createCipheriv, createDecipheriv, randomBytes, scrypt } from "node:crypto";
import { access, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { identityFromSeed } from "@qubic-labs/core";

const scryptAsync = (
  password: string,
  salt: Buffer,
  keylen: number,
  options: Readonly<{ N: number; r: number; p: number }>,
): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(derivedKey as Buffer);
    });
  });

const DEFAULT_SCRYPT_PARAMS = Object.freeze({
  N: 1 << 13,
  r: 8,
  p: 1,
  dkLen: 32,
});

const AES_GCM_NONCE_BYTES = 12;
const VAULT_VERSION = 1;

type VaultKdfParams = Readonly<{
  N: number;
  r: number;
  p: number;
  dkLen: number;
  saltBase64: string;
}>;

type VaultHeader = Readonly<{
  vaultVersion: number;
  kdf: Readonly<{
    name: "scrypt";
    params: VaultKdfParams;
  }>;
}>;

type VaultEntryEncrypted = Readonly<{
  nonceBase64: string;
  ciphertextBase64: string;
  tagBase64: string;
}>;

export type VaultEntry = Readonly<{
  name: string;
  identity: string;
  seedIndex: number;
  createdAt: string;
  updatedAt: string;
  encrypted: VaultEntryEncrypted;
}>;

export type VaultSummary = Readonly<{
  name: string;
  identity: string;
  seedIndex: number;
  createdAt: string;
  updatedAt: string;
}>;

type VaultFile = VaultHeader & Readonly<{ entries: readonly VaultEntry[] }>;

export type VaultExport = VaultFile;

export class VaultError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VaultError";
  }
}

export class VaultNotFoundError extends VaultError {
  constructor(path: string) {
    super(`Vault file not found: ${path}`);
    this.name = "VaultNotFoundError";
  }
}

export class VaultInvalidPassphraseError extends VaultError {
  constructor() {
    super("Invalid passphrase or corrupted vault data");
    this.name = "VaultInvalidPassphraseError";
  }
}

export class VaultEntryNotFoundError extends VaultError {
  constructor(ref: string) {
    super(`Vault entry not found: ${ref}`);
    this.name = "VaultEntryNotFoundError";
  }
}

export class VaultEntryExistsError extends VaultError {
  constructor(name: string) {
    super(`Vault entry already exists: ${name}`);
    this.name = "VaultEntryExistsError";
  }
}

export type SeedVault = Readonly<{
  path: string;
  list(): readonly VaultSummary[];
  getEntry(ref: string): VaultEntry;
  getIdentity(ref: string): string;
  getSeed(ref: string): Promise<string>;
  addSeed(
    input: Readonly<{ name: string; seed: string; seedIndex?: number; overwrite?: boolean }>,
  ): Promise<VaultSummary>;
  remove(ref: string): Promise<void>;
  rotatePassphrase(newPassphrase: string): Promise<void>;
  exportEncrypted(): VaultExport;
  exportJson(): string;
  importEncrypted(
    input: VaultExport | string,
    options?: Readonly<{ mode?: "merge" | "replace"; sourcePassphrase?: string }>,
  ): Promise<void>;
  getSeedSource(ref: string): Promise<Readonly<{ fromSeed: string }>>;
  save(): Promise<void>;
  close(): Promise<void>;
}>;

export type OpenSeedVaultInput = Readonly<{
  path: string;
  passphrase: string;
  create?: boolean;
  autoSave?: boolean;
  lock?: boolean;
  lockTimeoutMs?: number;
  kdfParams?: Readonly<{
    N?: number;
    r?: number;
    p?: number;
    dkLen?: number;
  }>;
}>;

export async function openSeedVault(input: OpenSeedVaultInput): Promise<SeedVault> {
  const { path, passphrase } = input;
  const autoSave = input.autoSave ?? true;
  const lockEnabled = input.lock ?? true;
  const lockTimeoutMs = input.lockTimeoutMs ?? 0;
  const lockPath = `${path}.lock`;

  let file: VaultFile | undefined;
  let lockHandle: Awaited<ReturnType<typeof open>> | undefined;
  let closed = false;

  try {
    if (lockEnabled) {
      lockHandle = await acquireLock(lockPath, lockTimeoutMs);
    }

    try {
      const raw = await readFile(path, "utf8");
      file = parseVaultFile(raw);
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw error;
      }
      if (!input.create) {
        throw new VaultNotFoundError(path);
      }
    }
  } catch (error) {
    await releaseLock(lockHandle, lockPath);
    throw error;
  }

  if (!file) {
    const params = createKdfParams(input.kdfParams);
    file = createEmptyVault(params);
    await writeVaultFile(path, file);
  }

  if (file.vaultVersion !== VAULT_VERSION) {
    throw new VaultError(`Unsupported vault version: ${file.vaultVersion}`);
  }

  let key = await deriveKey(passphrase, file.kdf.params);
  const entries = new Map(file.entries.map((entry) => [entry.name, entry]));

  const findEntry = (ref: string): VaultEntry => {
    const direct = entries.get(ref);
    if (direct) return direct;
    for (const entry of entries.values()) {
      if (entry.identity === ref) return entry;
    }
    throw new VaultEntryNotFoundError(ref);
  };

  const list = (): readonly VaultSummary[] => {
    return Array.from(entries.values()).map((entry) => ({
      name: entry.name,
      identity: entry.identity,
      seedIndex: entry.seedIndex,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    }));
  };

  const save = async (): Promise<void> => {
    if (!file) {
      throw new VaultError("Vault not initialized");
    }
    const updated: VaultFile = { ...file, entries: Array.from(entries.values()) };
    await writeVaultFile(path, updated);
    file = updated;
  };

  const addSeed = async ({
    name,
    seed,
    seedIndex = 0,
    overwrite = false,
  }: Readonly<{
    name: string;
    seed: string;
    seedIndex?: number;
    overwrite?: boolean;
  }>): Promise<VaultSummary> => {
    if (!overwrite && entries.has(name)) {
      throw new VaultEntryExistsError(name);
    }

    const identity = await identityFromSeed(seed, seedIndex);
    const encrypted = encryptSeed(seed, key);
    const now = new Date().toISOString();

    const entry: VaultEntry = {
      name,
      identity,
      seedIndex,
      createdAt: entries.get(name)?.createdAt ?? now,
      updatedAt: now,
      encrypted,
    };

    entries.set(name, entry);
    if (autoSave) await save();
    return {
      name: entry.name,
      identity: entry.identity,
      seedIndex: entry.seedIndex,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    };
  };

  const getSeed = async (ref: string): Promise<string> => {
    const entry = findEntry(ref);
    try {
      return decryptSeed(entry.encrypted, key);
    } catch {
      throw new VaultInvalidPassphraseError();
    }
  };

  const getIdentity = (ref: string): string => {
    return findEntry(ref).identity;
  };

  const remove = async (ref: string): Promise<void> => {
    const entry = findEntry(ref);
    entries.delete(entry.name);
    if (autoSave) await save();
  };

  const rotatePassphrase = async (newPassphrase: string): Promise<void> => {
    const params = createKdfParams(input.kdfParams);
    const nextKey = await deriveKey(newPassphrase, params);
    const now = new Date().toISOString();

    for (const entry of entries.values()) {
      const seed = decryptSeed(entry.encrypted, key);
      entries.set(entry.name, {
        ...entry,
        encrypted: encryptSeed(seed, nextKey),
        updatedAt: now,
      });
    }

    file = {
      vaultVersion: VAULT_VERSION,
      kdf: { name: "scrypt", params },
      entries: Array.from(entries.values()),
    };
    key = nextKey;
    await writeVaultFile(path, file);
  };

  const exportEncrypted = (): VaultExport => {
    if (!file) throw new VaultError("Vault not initialized");
    return { ...file, entries: Array.from(entries.values()) };
  };

  const exportJson = (): string => {
    return JSON.stringify(exportEncrypted(), null, 2);
  };

  const importEncrypted = async (
    inputExport: VaultExport | string,
    options?: Readonly<{ mode?: "merge" | "replace"; sourcePassphrase?: string }>,
  ): Promise<void> => {
    const source = typeof inputExport === "string" ? parseVaultFile(inputExport) : inputExport;
    const sourceKey = await deriveKey(options?.sourcePassphrase ?? passphrase, source.kdf.params);
    const mode = options?.mode ?? "merge";
    const now = new Date().toISOString();

    const nextEntries = mode === "replace" ? new Map<string, VaultEntry>() : new Map(entries);

    for (const entry of source.entries) {
      const seed = decryptSeed(entry.encrypted, sourceKey);
      const encrypted = encryptSeed(seed, key);
      nextEntries.set(entry.name, {
        name: entry.name,
        identity: entry.identity,
        seedIndex: entry.seedIndex,
        createdAt: entry.createdAt,
        updatedAt: now,
        encrypted,
      });
    }

    entries.clear();
    for (const [name, entry] of nextEntries.entries()) {
      entries.set(name, entry);
    }
    if (autoSave) await save();
  };

  const getSeedSource = async (ref: string): Promise<Readonly<{ fromSeed: string }>> => {
    const fromSeed = await getSeed(ref);
    return { fromSeed };
  };

  const close = async (): Promise<void> => {
    if (closed) return;
    closed = true;
    await releaseLock(lockHandle, lockPath);
  };

  if (lockHandle) {
    registerExitHandler(async () => {
      await releaseLock(lockHandle, lockPath);
    });
  }

  return {
    path,
    list,
    getEntry: findEntry,
    getIdentity,
    getSeed,
    addSeed,
    remove,
    rotatePassphrase,
    exportEncrypted,
    exportJson,
    importEncrypted,
    getSeedSource,
    save,
    close,
  };
}

function createKdfParams(
  overrides?: Readonly<{ N?: number; r?: number; p?: number; dkLen?: number }>,
): VaultKdfParams {
  const params = {
    N: overrides?.N ?? DEFAULT_SCRYPT_PARAMS.N,
    r: overrides?.r ?? DEFAULT_SCRYPT_PARAMS.r,
    p: overrides?.p ?? DEFAULT_SCRYPT_PARAMS.p,
    dkLen: overrides?.dkLen ?? DEFAULT_SCRYPT_PARAMS.dkLen,
  };
  const salt = randomBytes(16);
  return {
    ...params,
    saltBase64: salt.toString("base64"),
  };
}

function createEmptyVault(params: VaultKdfParams): VaultFile {
  return {
    vaultVersion: VAULT_VERSION,
    kdf: {
      name: "scrypt",
      params,
    },
    entries: [],
  };
}

async function deriveKey(passphrase: string, params: VaultKdfParams): Promise<Buffer> {
  const salt = Buffer.from(params.saltBase64, "base64");
  const derived = await scryptAsync(passphrase, salt, params.dkLen, {
    N: params.N,
    r: params.r,
    p: params.p,
  });
  return Buffer.isBuffer(derived) ? derived : Buffer.from(derived as ArrayBuffer);
}

function encryptSeed(seed: string, key: Buffer): VaultEntryEncrypted {
  const nonce = randomBytes(AES_GCM_NONCE_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const ciphertext = Buffer.concat([cipher.update(seed, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    nonceBase64: nonce.toString("base64"),
    ciphertextBase64: ciphertext.toString("base64"),
    tagBase64: tag.toString("base64"),
  };
}

function decryptSeed(encrypted: VaultEntryEncrypted, key: Buffer): string {
  const nonce = Buffer.from(encrypted.nonceBase64, "base64");
  const ciphertext = Buffer.from(encrypted.ciphertextBase64, "base64");
  const tag = Buffer.from(encrypted.tagBase64, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAuthTag(tag);
  const clear = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return clear.toString("utf8");
}

async function writeVaultFile(path: string, file: VaultFile): Promise<void> {
  const tmpPath = `${path}.tmp`;
  await writeFile(tmpPath, JSON.stringify(file, null, 2), "utf8");
  await rename(tmpPath, path);
}

function parseVaultFile(raw: string): VaultFile {
  const parsed = JSON.parse(raw) as VaultFile;
  if (!parsed || typeof parsed !== "object") {
    throw new VaultError("Invalid vault file");
  }
  if (!parsed.kdf || parsed.kdf.name !== "scrypt") {
    throw new VaultError("Unsupported KDF");
  }
  return parsed;
}

function isNotFoundError(error: unknown): error is { code: string } {
  if (!error || typeof error !== "object" || !("code" in error)) return false;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && code === "ENOENT";
}

export async function vaultExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function acquireLock(
  path: string,
  timeoutMs: number,
): Promise<Awaited<ReturnType<typeof open>>> {
  const start = Date.now();
  const retryMs = 200;
  while (true) {
    try {
      const handle = await open(path, "wx");
      await handle.writeFile(
        JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }, null, 2),
        "utf8",
      );
      return handle;
    } catch (error) {
      if (!isLockExistsError(error)) throw error;
      if (timeoutMs <= 0 || Date.now() - start >= timeoutMs) {
        throw new VaultError(`Vault is locked: ${path}`);
      }
      await new Promise((resolve) => setTimeout(resolve, retryMs));
    }
  }
}

async function releaseLock(
  handle: Awaited<ReturnType<typeof open>> | undefined,
  path: string,
): Promise<void> {
  if (!handle) return;
  try {
    await handle.close();
  } finally {
    await unlink(path).catch(() => undefined);
  }
}

function isLockExistsError(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("code" in error)) return false;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && code === "EEXIST";
}

const exitHandlers = new Set<() => Promise<void>>();

function registerExitHandler(fn: () => Promise<void>): void {
  exitHandlers.add(fn);
  if (exitHandlers.size === 1) {
    process.on("exit", () => {
      for (const handler of exitHandlers) {
        handler().catch(() => undefined);
      }
    });
  }
}
