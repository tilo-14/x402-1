---
"@x402/svm": minor
---

feat(svm): add Light Token support

- `ExactSvmScheme` uses Light Token path when `rpcUrl` is provided
- SDK auto-wraps SPL/T22 balances into Light Token accounts
- Facilitator auto-detects Light Token transactions from instructions
- Pre-transaction support for Light Token account loading
- `registerExactSvmScheme` accepts optional `rpcUrl` in config
- Zero changes to existing SPL Token/Token-2022 behavior
