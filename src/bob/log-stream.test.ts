import { describe, expect, it } from "bun:test";
import type { WebSocketLike } from "./log-stream.js";
import { createLogStream } from "./log-stream.js";

class FakeWebSocket implements WebSocketLike {
  static instances: FakeWebSocket[] = [];
  readonly readyState = 0;
  onopen: ((event: Record<string, unknown>) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: ((event: Record<string, unknown>) => void) | null = null;
  onclose: ((event: { code?: number; reason?: string }) => void) | null = null;
  sent: string[] = [];

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.onclose?.({});
  }

  open() {
    this.onopen?.({});
  }
}

describe("log stream", () => {
  it("sends batch subscribe on open", async () => {
    const stream = createLogStream({
      baseUrl: "http://example.test",
      subscriptions: [
        { scIndex: 1, logType: 100001 },
        { scIndex: 2, logType: 100002 },
      ],
      webSocketFactory: (url) => new FakeWebSocket(url),
    });

    const socket = FakeWebSocket.instances[0];
    expect(socket).toBeDefined();
    if (!socket) throw new Error("Missing test WebSocket instance");
    socket.open();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const sent = socket.sent.map((s) => JSON.parse(s));
    expect(sent.length).toBe(1);
    expect(sent[0]?.action).toBe("subscribe");
    expect(Array.isArray(sent[0]?.subscriptions)).toBe(true);
    expect(sent[0]?.subscriptions?.length).toBe(2);
    expect(stream.socket).toBe(socket);
  });
});
