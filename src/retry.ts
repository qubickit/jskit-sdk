export type RetryConfig = Readonly<{
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitterMs?: number;
  retryOnStatuses?: readonly number[];
  retryOnMethods?: readonly string[];
}>;

export type RetryConfigNormalized = Readonly<{
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterMs: number;
  retryOnStatuses: readonly number[];
  retryOnMethods: readonly string[];
}>;

const DEFAULT_RETRY_STATUSES = [408, 429, 500, 502, 503, 504] as const;

export function normalizeRetryConfig(input?: RetryConfig): RetryConfigNormalized {
  return {
    maxRetries: input?.maxRetries ?? 0,
    baseDelayMs: input?.baseDelayMs ?? 250,
    maxDelayMs: input?.maxDelayMs ?? 2_000,
    jitterMs: input?.jitterMs ?? 100,
    retryOnStatuses: input?.retryOnStatuses ?? DEFAULT_RETRY_STATUSES,
    retryOnMethods: input?.retryOnMethods ?? ["GET", "POST"],
  };
}

export async function withRetry<T>(
  config: RetryConfigNormalized,
  method: string,
  run: () => Promise<T>,
  shouldRetry: (error: unknown) => boolean,
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await run();
    } catch (error) {
      if (attempt >= config.maxRetries) throw error;
      if (!config.retryOnMethods.includes(method)) throw error;
      if (!shouldRetry(error)) throw error;
      const delay = computeDelay(config, attempt);
      await sleep(delay);
      attempt += 1;
    }
  }
}

function computeDelay(config: RetryConfigNormalized, attempt: number): number {
  const base = Math.min(config.baseDelayMs * 2 ** attempt, config.maxDelayMs);
  const jitter = config.jitterMs > 0 ? Math.floor(Math.random() * config.jitterMs) : 0;
  return base + jitter;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
