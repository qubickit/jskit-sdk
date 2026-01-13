export type VaultKdfParams = Readonly<{
  N: number;
  r: number;
  p: number;
  dkLen: number;
  saltBase64: string;
}>;

export type VaultHeader = Readonly<{
  vaultVersion: number;
  kdf: Readonly<{
    name: "scrypt";
    params: VaultKdfParams;
  }>;
}>;

export type VaultEntryEncrypted = Readonly<{
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

export type VaultExport = VaultHeader & Readonly<{ entries: readonly VaultEntry[] }>;

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
  signer(ref: string): Readonly<{ fromVault: string }>;
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
