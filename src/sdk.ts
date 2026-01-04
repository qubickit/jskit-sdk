export type SdkConfig = Readonly<{
  /** Placeholder for future: baseUrl, network, etc. */
  baseUrl?: string;
}>;

export function createSdk(_config: SdkConfig = {}) {
  return {};
}
