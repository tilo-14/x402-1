/**
 * Exact SVM payload structure containing a base64 encoded Solana transaction
 */
export type ExactSvmPayloadV1 = {
  /**
   * Base64 encoded Solana transaction
   */
  transaction: string;
};

/**
 * Exact SVM payload V2 structure.
 * Extends V1 with optional preTransactions for Light Token compressed account setup.
 */
export type ExactSvmPayloadV2 = ExactSvmPayloadV1 & {
  /**
   * Optional pre-transactions that must be executed before the main payment transaction.
   * Used for Light Token load instructions when accounts are in compressed (cold) state.
   * Each entry is a base64 encoded, partially-signed Solana transaction.
   */
  preTransactions?: string[];
};
