# Light Token Support

Light Token support in `@x402/svm` is purely additive. Existing SPL Token and Token-2022 flows continue to work unchanged. A new `LightExactSvmScheme` client class handles Light Token payments alongside the existing `ExactSvmScheme`.

## Client Usage

### SPL Token (unchanged)

```typescript
import { ExactSvmScheme } from "@x402/svm/exact/client";

const client = new ExactSvmScheme(signer);
x402Client.register("solana:*", client);
```

### Light Token (new)

```typescript
import { LightExactSvmScheme } from "@x402/svm/exact/client";

const client = new LightExactSvmScheme(signer, {
  rpcUrl: "https://mainnet.helius-rpc.com/?api-key=YOUR_KEY",
});
x402Client.register("solana:*", client);
```

The `rpcUrl` must point to a Photon-compatible RPC (Helius, Triton, etc.) that supports both standard Solana RPC and Light Token queries.

## Prerequisites

Before making Light Token payments, you need Light Token balances in your account:

1. Register the SPL mint with the Light Token Program (one-time per mint)
2. Create a Light Token ATA for your address
3. Wrap SPL tokens into Light Token accounts

See [Light Token documentation](https://www.zkcompression.com/light-token/welcome) for setup details.

## Facilitator

No changes needed. The existing facilitator auto-detects Light Token transactions by checking instruction program addresses. Update `@x402/svm` to the version with Light Token support.

## Resource Server

No changes needed. The resource server does not interact with the token transfer layer.

## SPL vs Light Token Comparison

| Aspect | SPL Token / Token-2022 | Light Token |
|---|---|---|
| Client class | `ExactSvmScheme` | `LightExactSvmScheme` |
| Instruction count | 3-6 (fixed) | 3-10 (variable) |
| Pre-transactions | Not supported | Supported (account loading) |
| Compute budget order | `[Limit, Price]` | Either order accepted |
| SDK | `@solana-program/token-2022` | `@lightprotocol/compressed-token` |

## Testing on Localnet

```bash
# Start Light test-validator (Solana RPC + Photon + Prover)
light test-validator

# Run integration tests
cd typescript/packages/mechanisms/svm
export SVM_RPC_URL=http://127.0.0.1:8899
pnpm test:integration
```

## Breaking Changes

None. Light Token support is purely additive:

- `ExactSvmScheme` (client and facilitator) is unchanged
- `ExactSvmPayloadV2` gained an optional `preTransactions` field
- V1 schemes are untouched
