import { identityFromSeed } from "@qubic-labs/core";
import type {
  Pbkdf2Hash,
  Pbkdf2KdfParams,
  SeedVault,
  VaultEntry,
  VaultEntryEncrypted,
  VaultExport,
  VaultHeader,
  VaultSummary,
} from "./vault/types.js";
import {
  VaultEntryExistsError,
  VaultEntryNotFoundError,
  VaultError,
  VaultInvalidPassphraseError,
  VaultNotFoundError,
} from "./vault/types.js";

const DEFAULT_PBKDF2_PARAMS = Object.freeze({
  iterations: 200_000,
  hash: "SHA-256" as Pbkdf2Hash,
  dkLen: 32,
});

const AES_GCM_NONCE_BYTES = 12;
const AES_GCM_TAG_BYTES = 16;
const VAULT_VERSION = 1;

type VaultFile = Omit<VaultHeader, "kdf"> &
  Readonly<{
    kdf: Readonly<{
      name: "pbkdf2";
      params: Pbkdf2KdfParams;
    }>;
    entries: readonly VaultEntry[];
  }>;

export type VaultStore = Readonly<{
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
  remove?(): Promise<void>;
  label?: string;
}>;

export type OpenSeedVaultBrowserInput = Readonly<{
  passphrase: string;
  create?: boolean;
  autoSave?: boolean;
  kdfParams?: Readonly<{
    iterations?: number;
    hash?: Pbkdf2Hash;
    dkLen?: number;
  }>;
  store: VaultStore;
  path?: string;
}>;

export async function openSeedVaultBrowser(input: OpenSeedVaultBrowserInput): Promise<SeedVault> {
  const { store, passphrase } = input;
  const autoSave = input.autoSave ?? true;
  const path = input.path ?? store.label ?? "vault";

  let file: VaultFile | undefined;
  const raw = await store.read();
  if (raw) file = parseVaultFile(raw);

  if (!file) {
    if (!input.create) {
      throw new VaultNotFoundError(path);
    }
    const params = createKdfParams(input.kdfParams);
    file = createEmptyVault(params);
    await store.write(JSON.stringify(file, null, 2));
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
    await store.write(JSON.stringify(updated, null, 2));
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
    const encrypted = await encryptSeed(seed, key);
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
      return await decryptSeed(entry.encrypted, key);
    } catch {
      throw new VaultInvalidPassphraseError();
    }
  };

  const getIdentity = (ref: string): string => {
    return findEntry(ref).identity;
  };

  const signer = (ref: string): Readonly<{ fromVault: string }> => {
    findEntry(ref);
    return { fromVault: ref };
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
      const seed = await decryptSeed(entry.encrypted, key);
      entries.set(entry.name, {
        ...entry,
        encrypted: await encryptSeed(seed, nextKey),
        updatedAt: now,
      });
    }

    file = {
      vaultVersion: VAULT_VERSION,
      kdf: { name: "pbkdf2", params },
      entries: Array.from(entries.values()),
    };
    key = nextKey;
    await save();
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
    if (source.kdf.name !== "pbkdf2") {
      throw new VaultError("Unsupported KDF");
    }
    const sourceKey = await deriveKey(options?.sourcePassphrase ?? passphrase, source.kdf.params);
    const mode = options?.mode ?? "merge";
    const now = new Date().toISOString();

    const nextEntries = mode === "replace" ? new Map<string, VaultEntry>() : new Map(entries);

    for (const entry of source.entries) {
      const seed = await decryptSeed(entry.encrypted, sourceKey);
      const encrypted = await encryptSeed(seed, key);
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
    return;
  };

  return {
    path,
    list,
    getEntry: findEntry,
    getIdentity,
    signer,
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

export function createMemoryVaultStore(label = "memory-vault"): VaultStore {
  let value: string | null = null;
  return {
    label,
    async read() {
      return value;
    },
    async write(next: string) {
      value = next;
    },
    async remove() {
      value = null;
    },
  };
}

export function createLocalStorageVaultStore(key: string, storage?: Storage): VaultStore {
  const store = storage ?? getDefaultStorage();
  if (!store) {
    throw new VaultError("localStorage is not available in this environment");
  }
  return {
    label: key,
    async read() {
      return store.getItem(key);
    },
    async write(next) {
      store.setItem(key, next);
    },
    async remove() {
      store.removeItem(key);
    },
  };
}

function getDefaultStorage(): Storage | undefined {
  const anyGlobal = globalThis as typeof globalThis & { localStorage?: Storage };
  return anyGlobal.localStorage;
}

function createKdfParams(
  overrides?: Readonly<{ iterations?: number; hash?: Pbkdf2Hash; dkLen?: number }>,
): Pbkdf2KdfParams {
  const params = {
    iterations: overrides?.iterations ?? DEFAULT_PBKDF2_PARAMS.iterations,
    hash: overrides?.hash ?? DEFAULT_PBKDF2_PARAMS.hash,
    dkLen: overrides?.dkLen ?? DEFAULT_PBKDF2_PARAMS.dkLen,
  };
  const salt = getRandomBytes(16);
  return {
    ...params,
    saltBase64: bytesToBase64(salt),
  };
}

function createEmptyVault(params: Pbkdf2KdfParams): VaultFile {
  return {
    vaultVersion: VAULT_VERSION,
    kdf: {
      name: "pbkdf2",
      params,
    },
    entries: [],
  };
}

async function deriveKey(passphrase: string, params: Pbkdf2KdfParams): Promise<CryptoKey> {
  const crypto = await getCrypto();
  const salt = base64ToBytes(params.saltBase64);
  const baseKey = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(utf8ToBytes(passphrase)),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: toArrayBuffer(salt),
      iterations: params.iterations,
      hash: params.hash,
    },
    baseKey,
    { name: "AES-GCM", length: params.dkLen * 8 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encryptSeed(seed: string, key: CryptoKey): Promise<VaultEntryEncrypted> {
  const crypto = await getCrypto();
  const nonce = getRandomBytes(AES_GCM_NONCE_BYTES);
  const ciphertextAndTag = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toArrayBuffer(nonce), tagLength: 128 },
    key,
    toArrayBuffer(utf8ToBytes(seed)),
  );
  const bytes = new Uint8Array(ciphertextAndTag);
  const ciphertext = bytes.slice(0, bytes.length - AES_GCM_TAG_BYTES);
  const tag = bytes.slice(bytes.length - AES_GCM_TAG_BYTES);
  return {
    nonceBase64: bytesToBase64(nonce),
    ciphertextBase64: bytesToBase64(ciphertext),
    tagBase64: bytesToBase64(tag),
  };
}

async function decryptSeed(encrypted: VaultEntryEncrypted, key: CryptoKey): Promise<string> {
  const crypto = await getCrypto();
  const nonce = base64ToBytes(encrypted.nonceBase64);
  const ciphertext = base64ToBytes(encrypted.ciphertextBase64);
  const tag = base64ToBytes(encrypted.tagBase64);
  const combined = new Uint8Array(ciphertext.length + tag.length);
  combined.set(ciphertext, 0);
  combined.set(tag, ciphertext.length);
  const clear = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: toArrayBuffer(nonce), tagLength: 128 },
    key,
    toArrayBuffer(combined),
  );
  return bytesToUtf8(new Uint8Array(clear));
}

function parseVaultFile(raw: string): VaultFile {
  const parsed = JSON.parse(raw) as VaultFile;
  if (!parsed || typeof parsed !== "object") {
    throw new VaultError("Invalid vault file");
  }
  if (!parsed.kdf || parsed.kdf.name !== "pbkdf2") {
    throw new VaultError("Unsupported KDF");
  }
  return parsed;
}

async function getCrypto(): Promise<Crypto> {
  if (globalThis.crypto?.subtle) return globalThis.crypto;
  throw new VaultError("WebCrypto is not available in this environment");
}

function getRandomBytes(length: number): Uint8Array<ArrayBuffer> {
  const crypto = globalThis.crypto;
  if (!crypto?.getRandomValues) {
    throw new VaultError("crypto.getRandomValues is not available");
  }
  const bytes = new Uint8Array(new ArrayBuffer(length));
  crypto.getRandomValues(bytes);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  if (typeof Buffer !== "undefined") {
    const buf = Buffer.from(base64, "base64");
    return new Uint8Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function utf8ToBytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const out = new Uint8Array(new ArrayBuffer(bytes.byteLength));
  out.set(bytes);
  return out.buffer;
}
