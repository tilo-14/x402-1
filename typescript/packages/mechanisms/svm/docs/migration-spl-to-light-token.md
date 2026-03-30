# Light Token Support

Light Token support in `@x402/svm` is purely additive. Existing SPL Token and Token-2022 flows continue to work unchanged. When a Photon-compatible `rpcUrl` is provided, `ExactSvmScheme` uses the Light Token path and auto-wraps SPL/T22 balances.

## Client Usage

### SPL Token (unchanged)

```typescript
import { ExactSvmScheme } from "@x402/svm/exact/client";

const client = new ExactSvmScheme(signer);
x402Client.register("solana:*", client);
```

### Light Token

```typescript
import { ExactSvmScheme } from "@x402/svm/exact/client";

const client = new ExactSvmScheme(signer, {
  rpcUrl: "https://mainnet.helius-rpc.com/?api-key=YOUR_KEY",
});
x402Client.register("solana:*", client);
```

The `rpcUrl` must point to a Photon-compatible RPC (Helius, Triton, etc.) that supports both standard Solana RPC and Light Token queries. When set, the SDK automatically wraps SPL/T22 balances into Light Token accounts.

## Facilitator

No changes needed. The existing facilitator auto-detects Light Token transactions by checking instruction program addresses. Update `@x402/svm` to the version with Light Token support.

## Resource Server

No changes needed. The resource server does not interact with the token transfer layer.

## SPL vs Light Token Comparison

| Aspect | SPL Token / Token-2022 | Light Token |
|---|---|---|
| Client class | `ExactSvmScheme` | `ExactSvmScheme` (with `rpcUrl`) |
| Instruction count | 3-6 (fixed) | 3-10 (variable) |
| Account loading | Manual | Automatic (SDK handles inline) |
| Compute budget order | `[Limit, Price]` | Either order accepted |
| SDK | `@solana-program/token-2022` | `@lightprotocol/token-interface` |

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

- `ExactSvmScheme` (client and facilitator) is unchanged when no `rpcUrl` is provided
- `ExactSvmPayloadV2` is unchanged
- V1 schemes are untouched
