import type { PaymentPayload, PaymentRequirements, SchemeNetworkClient } from "@x402/core/types";
import type { ClientSvmSigner } from "../../signer";
import { buildLightTokenPayload } from "./light-token";

export type LightExactSvmSchemeConfig = {
  /** Photon-compatible RPC URL for Light Token operations. */
  rpcUrl: string;
};

/** SVM Exact scheme client for Light Token payments. */
export class LightExactSvmScheme implements SchemeNetworkClient {
  readonly scheme = "exact";

  constructor(
    private readonly signer: ClientSvmSigner,
    private readonly config: LightExactSvmSchemeConfig,
  ) {}

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
        "Insufficient Light Token balance for this payment. " +
          "Ensure you have wrapped tokens into Light Token accounts.",
      );
    }

    return {
      x402Version,
      payload,
    };
  }
}
