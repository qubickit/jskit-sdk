export type LogSubscription = Readonly<{
  scIndex: number;
  logType: number;
  lastTick?: number;
  lastLogId?: number;
}>;

export type LogCursor = Readonly<{ lastTick?: number; lastLogId?: number }>;

export type LogCursorStore = Readonly<{
  get(key: string): LogCursor | Promise<LogCursor | undefined> | undefined;
  set(key: string, cursor: LogCursor): void | Promise<void>;
}>;

export type LogStreamHandlers = Readonly<{
  onOpen?: () => void;
  onClose?: (event: CloseEventLike) => void;
  onError?: (event: EventLike) => void;
  onWelcome?: (message: Record<string, unknown>) => void;
  onAck?: (message: Record<string, unknown>) => void;
  onLog?: (message: Record<string, unknown>) => void;
  onCatchUpComplete?: (message: Record<string, unknown>) => void;
  onPong?: (message: Record<string, unknown>) => void;
  onServerError?: (message: Record<string, unknown>) => void;
}>;

export type LogStreamConfig = LogStreamHandlers &
  Readonly<{
    baseUrl: string;
    subscriptions?: readonly LogSubscription[];
    lastTick?: number;
    lastLogId?: number;
    cursorStore?: LogCursorStore;
    webSocketFactory?: (url: string) => WebSocketLike;
    signal?: AbortSignal;
  }>;

export type LogStream = Readonly<{
  socket: WebSocketLike;
  subscribe(sub: LogSubscription): void;
  subscribeMany(subs: readonly LogSubscription[], cursor?: LogCursor): void;
  unsubscribe(sub: LogSubscription): void;
  unsubscribeAll(): void;
  ping(): void;
  close(code?: number, reason?: string): void;
}>;

export function createLogStream(config: LogStreamConfig): LogStream {
  const wsUrl = toWebSocketUrl(config.baseUrl);
  const createSocket = config.webSocketFactory ?? defaultWebSocketFactory;
  const socket = createSocket(wsUrl);

  const pending: string[] = [];
  let open = false;

  const sendMessage = (message: Record<string, unknown>) => {
    const text = JSON.stringify(message);
    if (!open) {
      pending.push(text);
      return;
    }
    socket.send(text);
  };

  socket.onopen = () => {
    open = true;
    for (const text of pending.splice(0, pending.length)) socket.send(text);
    config.onOpen?.();
    if (config.subscriptions?.length) {
      bootstrapSubscriptions(config.subscriptions);
    }
  };

  socket.onmessage = (event) => {
    const data = typeof event.data === "string" ? event.data : "";
    let message: Record<string, unknown> | null = null;
    try {
      message = JSON.parse(data) as Record<string, unknown>;
    } catch {
      return;
    }
    if (!message) return;

    const type = typeof message.type === "string" ? message.type : "";
    if (type === "welcome") config.onWelcome?.(message);
    else if (type === "ack") config.onAck?.(message);
    else if (type === "log") {
      config.onLog?.(message);
      maybeUpdateCursor(message);
    } else if (type === "catchUpComplete") config.onCatchUpComplete?.(message);
    else if (type === "pong") config.onPong?.(message);
    else if (type === "error") config.onServerError?.(message);
  };

  socket.onerror = (event) => {
    config.onError?.(event);
  };

  socket.onclose = (event) => {
    open = false;
    config.onClose?.(event);
  };

  if (config.signal) {
    if (config.signal.aborted) socket.close();
    else config.signal.addEventListener("abort", () => socket.close(), { once: true });
  }

  const subscribe = (sub: LogSubscription) => {
    sendMessage({
      action: "subscribe",
      scIndex: sub.scIndex,
      logType: sub.logType,
      ...(sub.lastLogId !== undefined ? { lastLogId: sub.lastLogId } : {}),
      ...(sub.lastTick !== undefined && sub.lastLogId === undefined
        ? { lastTick: sub.lastTick }
        : {}),
    });
  };

  const subscribeMany = (subs: readonly LogSubscription[], cursor?: LogCursor) => {
    sendMessage({
      action: "subscribe",
      ...(cursor?.lastLogId !== undefined ? { lastLogId: cursor.lastLogId } : {}),
      ...(cursor?.lastTick !== undefined && cursor.lastLogId === undefined
        ? { lastTick: cursor.lastTick }
        : {}),
      subscriptions: subs.map((s) => ({ scIndex: s.scIndex, logType: s.logType })),
    });
  };

  const unsubscribe = (sub: LogSubscription) => {
    sendMessage({
      action: "unsubscribe",
      scIndex: sub.scIndex,
      logType: sub.logType,
    });
  };

  const unsubscribeAll = () => {
    sendMessage({ action: "unsubscribeAll" });
  };

  const ping = () => {
    sendMessage({ action: "ping" });
  };

  const close = (code?: number, reason?: string) => {
    socket.close(code, reason);
  };

  const bootstrapSubscriptions = async (subs: readonly LogSubscription[]) => {
    const withCursor: LogSubscription[] = [];
    for (const s of subs) {
      const cursor = await getCursorFor(s);
      withCursor.push({ ...s, ...cursor });
    }

    const hasPerCursor = withCursor.some(
      (s) => s.lastLogId !== undefined || s.lastTick !== undefined,
    );
    if (!hasPerCursor && withCursor.length > 1) {
      subscribeMany(withCursor, {
        lastLogId: config.lastLogId,
        lastTick: config.lastTick,
      });
      return;
    }

    for (const sub of withCursor) subscribe(sub);
  };

  const getCursorFor = async (sub: LogSubscription): Promise<LogCursor | undefined> => {
    if (sub.lastLogId !== undefined || sub.lastTick !== undefined) {
      return { lastLogId: sub.lastLogId, lastTick: sub.lastTick };
    }
    if (!config.cursorStore) return undefined;
    return config.cursorStore.get(cursorKey(sub.scIndex, sub.logType));
  };

  const maybeUpdateCursor = (message: Record<string, unknown>) => {
    if (!config.cursorStore) return;
    const scIndex = asNumber(message.scIndex);
    const logType = asNumber(message.logType);
    if (scIndex === undefined || logType === undefined) return;

    const payload = expectObject(message.message);
    const logId = asNumber(payload.logId ?? payload.id);
    const tick = asNumber(payload.tick ?? payload.tickNumber);
    if (logId === undefined && tick === undefined) return;

    const cursor: LogCursor = logId !== undefined ? { lastLogId: logId } : { lastTick: tick };
    config.cursorStore.set(cursorKey(scIndex, logType), cursor);
  };

  return { socket, subscribe, subscribeMany, unsubscribe, unsubscribeAll, ping, close };
}

function toWebSocketUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  const wsProtocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.protocol = wsProtocol;
  const basePath = url.pathname.replace(/\/$/, "");
  url.pathname = `${basePath}/ws/logs`;
  return url.toString();
}

function cursorKey(scIndex: number, logType: number): string {
  return `${scIndex}:${logType}`;
}

function expectObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") return {};
  return value as Record<string, unknown>;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return value;
}

function defaultWebSocketFactory(url: string): WebSocketLike {
  if (typeof WebSocket === "undefined") {
    throw new Error("WebSocket is not available; provide webSocketFactory");
  }
  return new WebSocket(url) as WebSocketLike;
}

export type WebSocketLike = {
  readonly readyState: number;
  onopen: ((event: EventLike) => void) | null;
  onmessage: ((event: MessageEventLike) => void) | null;
  onerror: ((event: EventLike) => void) | null;
  onclose: ((event: CloseEventLike) => void) | null;
  send(data: string): void;
  close(code?: number, reason?: string): void;
};

export type EventLike = Readonly<Record<string, unknown>>;
export type MessageEventLike = Readonly<{ data: string }>;
export type CloseEventLike = Readonly<{ code?: number; reason?: string }>;
