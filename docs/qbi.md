# QBI in @qubic-labs/sdk

QBI files describe contract interfaces (functions + procedures, input/output sizes, and metadata). The SDK consumes user-provided QBI JSON files and uses them to build query/procedure helpers.

If you need to generate QBI files from Qubic headers, use `@qubic-labs/qbi`.

## Load QBI files

Bun/Node can load JSON QBI files directly. Examples below load files from disk so you control the registry version that your app uses.

```ts
import { createSdk } from "@qubic-labs/sdk";

const qbiFile = await Bun.file("./registry/QUtil.qbi").json();

const sdk = createSdk({
  baseUrl: "https://rpc.qubic.org",
  qbi: { files: [qbiFile] },
});
```

If you prefer static imports (ESM):

```ts
import qutil from "./registry/QUtil.qbi" assert { type: "json" };
import { createSdk } from "@qubic-labs/sdk";

const sdk = createSdk({ baseUrl: "https://rpc.qubic.org", qbi: { files: [qutil] } });
```

## Query a contract function

```ts
const qbi = sdk.qbi;
if (!qbi) throw new Error("QBI not configured");

const result = await qbi.contract("QUtil").query("GetFees", {
  inputBytes: new Uint8Array([0]),
});

console.log(result.responseBase64, result.responseBytes);
```

`query` uses the function entry in the QBI file and will use `outputSize` when present. If you are working with a file where the size is missing or evolving, you can pass `expectedOutputSize` or set `allowSizeMismatch`.

## Send a procedure transaction

```ts
await qbi.contract("QUtil").sendProcedureAndConfirm({
  name: "BurnQubic",
  fromSeed,
  amount: 0n,
  inputBytes: new Uint8Array([/* procedure payload */]),
});
```

Procedure helpers require `transactions` to be configured in the SDK (the default `createSdk` wiring already includes them).

## Add a codec for typed inputs/outputs

You can provide a codec to encode/decode values instead of passing raw bytes. This is especially useful once the QBI schema is stable.

```ts
const codec = {
  encode(entry, value) {
    if (entry.name !== "GetFees") throw new Error("Unsupported entry");
    return new Uint8Array([0]);
  },
  decode(entry, bytes) {
    if (entry.name !== "GetFees") throw new Error("Unsupported entry");
    return bytes;
  },
};

const response = await qbi.contract("QUtil").query("GetFees", {
  inputValue: {},
  codec,
});
```

## Registry tips

- The SDK only uses the QBI files you pass in, so you control updates and breaking changes.
- Queries require a `contractIndex` in the QBI file. Procedures can also use `contractPublicKeyHex` or `contractId` to derive the identity when building transactions.
- If you use multiple files, the SDK builds a registry by name and by index. Contract names must be unique.
