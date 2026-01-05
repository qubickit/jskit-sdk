export type TxQueuePolicy = "waitForConfirm" | "reject" | "replaceHigherTick";

export type TxQueueItemStatus =
  | "pending"
  | "submitted"
  | "confirming"
  | "confirmed"
  | "failed"
  | "superseded";

export type TxQueueConfirmFn = (input: {
  txId: string;
  targetTick: bigint;
  signal: AbortSignal;
}) => Promise<void>;

export type TxQueueConfig = Readonly<{
  policy?: TxQueuePolicy;
  confirm: TxQueueConfirmFn;
}>;

export type EnqueueTxInput<Result> = Readonly<{
  sourceIdentity: string;
  targetTick: bigint | number;
  submit: (input: { signal: AbortSignal }) => Promise<Readonly<{ txId: string; result: Result }>>;
  confirm?: TxQueueConfirmFn;
}>;

export type TxQueueItem<Result> = Readonly<{
  id: string;
  sourceIdentity: string;
  targetTick: bigint;
  createdAtMs: number;
  status: TxQueueItemStatus;
  txId?: string;
  result?: Result;
  error?: unknown;
}>;

export class TxQueueError extends Error {
  override name = "TxQueueError";
}

export class TxQueue {
  readonly #policy: TxQueuePolicy;
  readonly #confirm: TxQueueConfirmFn;

  readonly #activeBySource = new Map<string, ActiveItem<unknown>>();
  readonly #itemsBySource = new Map<string, TxQueueItem<unknown>[]>();

  constructor(config: TxQueueConfig) {
    this.#policy = config.policy ?? "waitForConfirm";
    this.#confirm = config.confirm;
  }

  getItems(sourceIdentity?: string): readonly TxQueueItem<unknown>[] {
    if (sourceIdentity) return (this.#itemsBySource.get(sourceIdentity) ?? []).slice();
    const all: TxQueueItem<unknown>[] = [];
    for (const items of this.#itemsBySource.values()) all.push(...items);
    return all;
  }

  getActive(sourceIdentity: string): TxQueueItem<unknown> | undefined {
    return this.#activeBySource.get(sourceIdentity)?.item;
  }

  async enqueue<Result>(input: EnqueueTxInput<Result>): Promise<TxQueueItem<Result>> {
    const sourceIdentity = input.sourceIdentity;
    const targetTick = toBigint(input.targetTick);
    const policy = this.#policy;

    const existing = this.#activeBySource.get(sourceIdentity);
    if (existing) {
      if (policy === "waitForConfirm") {
        await existing.done;
      } else if (policy === "reject") {
        throw new TxQueueError(
          `TxQueue rejected enqueue: source ${sourceIdentity} already has an active transaction`,
        );
      } else if (policy === "replaceHigherTick") {
        if (targetTick <= existing.item.targetTick) {
          throw new TxQueueError(
            `TxQueue rejected enqueue: targetTick ${targetTick} must be higher than active targetTick ${existing.item.targetTick}`,
          );
        }
        existing.supersede();
      } else {
        throw new TxQueueError(`Unknown policy: ${policy}`);
      }
    }

    const id = crypto.randomUUID();
    const controller = new AbortController();
    const createdAtMs = Date.now();
    const deferred = createDeferred<TxQueueItem<Result>>();

    const item: MutableTxQueueItem<Result> = {
      id,
      sourceIdentity,
      targetTick,
      createdAtMs,
      status: "pending",
    };

    const active: ActiveItem<Result> = {
      item,
      controller,
      confirm: input.confirm ?? this.#confirm,
      done: deferred.promise,
      supersede: () => {
        if (
          item.status === "confirmed" ||
          item.status === "failed" ||
          item.status === "superseded"
        ) {
          return;
        }
        item.status = "superseded";
        controller.abort();
        deferred.resolve({ ...item });
        this.#activeBySource.delete(sourceIdentity);
      },
    };

    this.#activeBySource.set(sourceIdentity, active as ActiveItem<unknown>);
    this.#pushItem(sourceIdentity, item as TxQueueItem<unknown>);

    void this.#run(active, input, deferred);
    return deferred.promise;
  }

  #pushItem(sourceIdentity: string, item: TxQueueItem<unknown>) {
    const list = this.#itemsBySource.get(sourceIdentity);
    if (list) list.push(item);
    else this.#itemsBySource.set(sourceIdentity, [item]);
  }

  async #run<Result>(
    active: ActiveItem<Result>,
    input: EnqueueTxInput<Result>,
    deferred: Deferred<TxQueueItem<Result>>,
  ) {
    const item = active.item;
    try {
      const submitted = await input.submit({ signal: active.controller.signal });
      if (getStatus(item) === "superseded") return;

      item.status = "submitted";
      item.txId = submitted.txId;
      item.result = submitted.result;

      item.status = "confirming";
      await active.confirm({
        txId: submitted.txId,
        targetTick: item.targetTick,
        signal: active.controller.signal,
      });
      if (getStatus(item) === "superseded") return;

      item.status = "confirmed";
      deferred.resolve({ ...item });
    } catch (err) {
      if (getStatus(item) === "superseded") return;
      item.status = "failed";
      item.error = err;
      deferred.resolve({ ...item });
    } finally {
      const current = this.#activeBySource.get(item.sourceIdentity);
      if (current?.item.id === item.id) {
        this.#activeBySource.delete(item.sourceIdentity);
      }
    }
  }
}

type MutableTxQueueItem<Result> = {
  -readonly [K in keyof TxQueueItem<Result>]: TxQueueItem<Result>[K];
};

type ActiveItem<Result> = Readonly<{
  item: MutableTxQueueItem<Result>;
  controller: AbortController;
  confirm: TxQueueConfirmFn;
  done: Promise<TxQueueItem<Result>>;
  supersede: () => void;
}>;

type Deferred<T> = Readonly<{
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}>;

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function toBigint(value: bigint | number): bigint {
  if (typeof value === "bigint") return value;
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new TypeError("Expected an integer");
  }
  return BigInt(value);
}

function getStatus(item: { status: TxQueueItemStatus }): TxQueueItemStatus {
  return item.status;
}
