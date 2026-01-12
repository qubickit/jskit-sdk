import { createSdk } from "../src/sdk.js";

const qbiPath = process.env.QUBIC_QBI_PATH;
const contractName = process.env.QUBIC_QBI_CONTRACT;
const functionName = process.env.QUBIC_QBI_FUNCTION;

if (!qbiPath) throw new Error("Missing env var: QUBIC_QBI_PATH");
if (!contractName) throw new Error("Missing env var: QUBIC_QBI_CONTRACT");
if (!functionName) throw new Error("Missing env var: QUBIC_QBI_FUNCTION");

const qbiFile = await Bun.file(qbiPath).json();
const inputHex = process.env.QUBIC_QBI_INPUT_HEX ?? "00";
const inputBytes = hexToBytes(inputHex);

const sdk = createSdk({
  baseUrl: process.env.QUBIC_RPC_URL ?? "https://rpc.qubic.org",
  qbi: { files: [qbiFile] },
});

if (!sdk.qbi) throw new Error("QBI not configured");

const res = await sdk.qbi.contract(contractName).query(functionName, {
  inputBytes,
});

console.log({
  outputHex: bytesToHex(res.responseBytes),
  outputBase64: res.responseBase64,
  outputLength: res.responseBytes.length,
});

function hexToBytes(hex: string): Uint8Array {
  const cleaned = hex.startsWith("0x") || hex.startsWith("0X") ? hex.slice(2) : hex;
  if (cleaned.length % 2 !== 0) throw new Error("QUBIC_QBI_INPUT_HEX must be even length");
  const out = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < out.length; i++) {
    const start = i * 2;
    out[i] = Number.parseInt(cleaned.slice(start, start + 2), 16);
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) {
    out += byte.toString(16).padStart(2, "0");
  }
  return out;
}
