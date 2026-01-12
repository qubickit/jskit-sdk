import { readFile, writeFile } from "node:fs/promises";
import { createLogStream } from "../src/bob/log-stream.js";

const baseUrl = process.env.QUBIC_BOB_URL ?? "http://localhost:40420";
const cursorPath = process.env.QUBIC_CURSOR_PATH ?? "./examples/.cursor.json";

const cursorStore = {
  async get(key: string) {
    const data = await readCursorFile();
    return data[key];
  },
  async set(key: string, cursor: { lastTick?: number; lastLogId?: number }) {
    const data = await readCursorFile();
    data[key] = cursor;
    await writeFile(cursorPath, JSON.stringify(data, null, 2));
  },
};

const stream = createLogStream({
  baseUrl,
  cursorStore,
  subscriptions: [{ scIndex: 0, logType: 0 }],
  onWelcome: (msg) => console.log("welcome", msg),
  onLog: (msg) => console.log("log", msg),
  onCatchUpComplete: (msg) => console.log("catch-up complete", msg),
  onError: (err) => console.error("ws error", err),
  onServerError: (err) => console.error("server error", err),
});

console.log("log stream started", { baseUrl, cursorPath, socketState: stream.socket.readyState });

async function readCursorFile(): Promise<
  Record<string, { lastTick?: number; lastLogId?: number }>
> {
  try {
    const text = await readFile(cursorPath, "utf8");
    return JSON.parse(text) as Record<string, { lastTick?: number; lastLogId?: number }>;
  } catch {
    return {};
  }
}
