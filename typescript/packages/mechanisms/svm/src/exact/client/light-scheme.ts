import type { PaymentPayload, PaymentRequirements, SchemeNetworkClient } from "@x402/core/types";
import type { ClientSvmSigner } from "../../signer";
import { buildLightTokenPayload } from "./light-token";

/**
 * Configuration for the Light Token client scheme.
 */
export type LightExactSvmSchemeConfig = {
  /**
   * Photon-compatible RPC URL (e.g., Helius) for compressed token operations.
   * Must support both standard Solana RPC and Photon indexer queries.
   */
  rpcUrl: string;
};

/**
 * SVM client implementation for the Exact payment scheme using Light Token (compressed tokens).
 * Use this instead of ExactSvmScheme when paying with compressed token balances.
 *
 * @example
 * ```ts
 * import { LightExactSvmScheme } from "@x402/svm/exact/client";
 *
 * const client = createX402Client(wallet);
 * client.register("solana:*", new LightExactSvmScheme(signer, {
 *   rpcUrl: "https://mainnet.helius-rpc.com/?api-key=YOUR_KEY"
 * }));
 * ```
 */
export class LightExactSvmScheme implements SchemeNetworkClient {
  readonly scheme = "exact";

  /**
   * Creates a new LightExactSvmScheme instance.
   *
   * @param signer - The SVM signer for client operations
   * @param config - Configuration with Photon-compatible RPC URL
   */
  constructor(
    private readonly signer: ClientSvmSigner,
    private readonly config: LightExactSvmSchemeConfig,
  ) {}

  /**
   * Creates a payment payload using Light Token compressed transfers.
   * Returns a payload with the main transaction and optional pre-transactions
   * for loading compressed accounts.
   *
   * @param x402Version - The x402 protocol version
   * @param paymentRequirements - The payment requirements
   * @returns Promise resolving to a payment payload
   */
  async createPaymentPayload(
    x402Version: number,
    paymentRequirements: PaymentRequirements,
  ): Promise<Pick<PaymentPayload, "x402Version" | "payload">> {
    const payload = await buildLightTokenPayload(
      this.signer,
      this.config.rpcUrl,
      paymentRequirements,
    );

    if (!payload) {
      throw new Error(
        "Insufficient compressed token balance for this payment. " +
          "Ensure you have wrapped tokens into compressed accounts.",
      );
    }

    return {
      x402Version,
      payload,
    };
  }
}
