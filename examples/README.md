# Examples

Run from `jskit-sdk/`:

```bash
bun run examples:transfer
bun run examples:send-many
bun run examples:log-stream
```

Env vars:

- `QUBIC_SEED`: sender seed (required for transfer + send-many)
- `QUBIC_TO_IDENTITY`: destination identity for simple transfer
- `QUBIC_QUTIL_IDENTITY`: QUTIL contract identity for send-many
- `QUBIC_RPC_URL`: RPC base URL (default: https://rpc.qubic.org)
- `QUBIC_BOB_URL`: QubicBob base URL (default: http://localhost:40420)
- `QUBIC_CURSOR_PATH`: log cursor file path (default: ./examples/.cursor.json)
