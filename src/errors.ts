export type ErrorContext = Readonly<Record<string, unknown>>;

export class SdkError extends Error {
  readonly code: string;
  readonly context?: ErrorContext;
  override readonly cause?: unknown;

  constructor(code: string, message: string, context?: ErrorContext, cause?: unknown) {
    super(message, { cause });
    this.name = "SdkError";
    this.code = code;
    this.context = context;
    this.cause = cause;
  }
}
