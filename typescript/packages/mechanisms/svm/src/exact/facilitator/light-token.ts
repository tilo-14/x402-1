import {
  COMPUTE_BUDGET_PROGRAM_ADDRESS,
  parseSetComputeUnitLimitInstruction,
  parseSetComputeUnitPriceInstruction,
} from "@solana-program/compute-budget";
import { type Address } from "@solana/kit";
import type {
  Network,
  PaymentRequirements,
  SettleResponse,
  VerifyResponse,
} from "@x402/core/types";
import {
  LIGHT_TOKEN_PROGRAM_ADDRESS,
  LIGHT_TOKEN_DISC_TRANSFER_CHECKED,
  LIGHT_TOKEN_DISC_TRANSFER2,
  MAX_COMPUTE_UNIT_PRICE_MICROLAMPORTS,
  MEMO_PROGRAM_ADDRESS,
  LIGHTHOUSE_PROGRAM_ADDRESS,
} from "../../constants";
import type { FacilitatorSvmSigner } from "../../signer";
import type { ExactSvmPayloadV2 } from "../../types";
import {
  createRpcClient,
  decodeTransactionFromPayload,
  getTokenPayerFromTransaction,
  parseLightTokenTransferInstruction,
} from "../../utils";

/**
 * Check if any instruction in the list targets the Light Token program.
 *
 * @param instructions - Decompiled transaction instructions
 * @returns true if Light Token instructions are present
 */
export function containsLightTokenInstruction(
  instructions: ReadonlyArray<{ programAddress: { toString(): string } }>,
): boolean {
  return instructions.some(ix => ix.programAddress.toString() === LIGHT_TOKEN_PROGRAM_ADDRESS);
}

/**
 * Full Light Token transaction verification.
 * Called by the facilitator when Light Token instructions are detected.
 *
 * @param instructions - Decompiled main transaction instructions
 * @param payload - The SVM payload
 * @param requirements - Payment requirements
 * @param signer - Facilitator signer
 * @param signerAddresses - Facilitator's managed addresses as strings
 * @returns Verification response
 */
export async function validateLightTokenTransaction(
  instructions: ReadonlyArray<{
    programAddress: { toString(): string };
    data?: Readonly<Uint8Array>;
    accounts?: ReadonlyArray<{ address: { toString(): string } }>;
  }>,
  payload: ExactSvmPayloadV2,
  requirements: PaymentRequirements,
  signer: FacilitatorSvmSigner,
  signerAddresses: string[],
): Promise<VerifyResponse> {
  const transaction = decodeTransactionFromPayload(payload);
  const payer = getTokenPayerFromTransaction(transaction);
  if (!payer) {
    return {
      isValid: false,
      invalidReason: "invalid_exact_svm_payload_no_transfer_instruction",
      payer: "",
    };
  }

  // Light Token: allow 3-10 instructions
  if (instructions.length < 3 || instructions.length > 10) {
    return {
      isValid: false,
      invalidReason: "invalid_exact_svm_payload_transaction_instructions_length",
      payer,
    };
  }

  // Verify compute budget instructions (accept either order for Light Token)
  let computeLimitFound = false;
  let computePriceFound = false;
  for (let i = 0; i < Math.min(2, instructions.length); i++) {
    const ix = instructions[i];
    if (ix.programAddress.toString() !== COMPUTE_BUDGET_PROGRAM_ADDRESS.toString()) {
      continue;
    }
    const disc = ix.data?.[0];
    if (disc === 2 && !computeLimitFound) {
      try {
        parseSetComputeUnitLimitInstruction(ix as never);
        computeLimitFound = true;
      } catch {
        return {
          isValid: false,
          invalidReason:
            "invalid_exact_svm_payload_transaction_instructions_compute_limit_instruction",
          payer,
        };
      }
    } else if (disc === 3 && !computePriceFound) {
      try {
        const parsed = parseSetComputeUnitPriceInstruction(ix as never);
        if (
          (parsed as unknown as { microLamports: bigint }).microLamports >
          BigInt(MAX_COMPUTE_UNIT_PRICE_MICROLAMPORTS)
        ) {
          return {
            isValid: false,
            invalidReason:
              "invalid_exact_svm_payload_transaction_instructions_compute_price_instruction_too_high",
            payer,
          };
        }
        computePriceFound = true;
      } catch {
        return {
          isValid: false,
          invalidReason:
            "invalid_exact_svm_payload_transaction_instructions_compute_price_instruction",
          payer,
        };
      }
    }
  }

  // Scan for the Light Token transfer instruction (disc 12), skipping disc 101 (setup)
  let transferIx: (typeof instructions)[number] | undefined;
  for (let i = 2; i < instructions.length; i++) {
    const ix = instructions[i];
    if (ix.programAddress.toString() === LIGHT_TOKEN_PROGRAM_ADDRESS) {
      const disc = ix.data?.[0];
      if (disc === LIGHT_TOKEN_DISC_TRANSFER2) continue;
      if (disc === LIGHT_TOKEN_DISC_TRANSFER_CHECKED) {
        transferIx = ix;
        break;
      }
    }
  }

  if (!transferIx) {
    return {
      isValid: false,
      invalidReason: "invalid_exact_svm_payload_no_transfer_instruction",
      payer,
    };
  }

  // Parse the Light Token transfer
  let parsedTransfer;
  try {
    parsedTransfer = parseLightTokenTransferInstruction(transferIx);
  } catch {
    return {
      isValid: false,
      invalidReason: "invalid_exact_svm_payload_no_transfer_instruction",
      payer,
    };
  }

  // SECURITY: Prevent facilitator from signing away own tokens
  if (signerAddresses.includes(parsedTransfer.authority)) {
    return {
      isValid: false,
      invalidReason: "invalid_exact_svm_payload_transaction_fee_payer_transferring_funds",
      payer,
    };
  }

  // Verify mint
  if (parsedTransfer.mint !== requirements.asset) {
    return {
      isValid: false,
      invalidReason: "invalid_exact_svm_payload_mint_mismatch",
      payer,
    };
  }

  // Verify amount
  if (parsedTransfer.amount !== BigInt(requirements.amount)) {
    return {
      isValid: false,
      invalidReason: "invalid_exact_svm_payload_amount_mismatch",
      payer,
    };
  }

  // Validate optional instructions (everything that isn't compute budget, transfer, or known programs)
  const allowedPrograms = new Set([
    COMPUTE_BUDGET_PROGRAM_ADDRESS.toString(),
    LIGHT_TOKEN_PROGRAM_ADDRESS,
    MEMO_PROGRAM_ADDRESS,
    LIGHTHOUSE_PROGRAM_ADDRESS,
  ]);
  for (const ix of instructions) {
    if (!allowedPrograms.has(ix.programAddress.toString())) {
      return {
        isValid: false,
        invalidReason: "invalid_exact_svm_payload_unknown_instruction_program",
        payer,
      };
    }
  }

  // Sign and simulate main transaction
  try {
    const feePayer = requirements.extra!.feePayer as Address;
    const fullySignedTransaction = await signer.signTransaction(
      payload.transaction,
      feePayer,
      requirements.network,
    );
    await signer.simulateTransaction(fullySignedTransaction, requirements.network);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      isValid: false,
      invalidReason: "transaction_simulation_failed",
      invalidMessage: errorMessage,
      payer,
    };
  }

  return {
    isValid: true,
    invalidReason: undefined,
    payer,
  };
}

/**
 * Settle a Light Token transaction.
 * Uses its own RPC client for skipPreflight on sends.
 *
 * @param payload - The SVM payload
 * @param requirements - Payment requirements
 * @param signer - Facilitator signer
 * @param payer - The verified payer address
 * @param network - CAIP-2 network identifier
 * @returns Settlement response
 */
export async function settleLightTokenTransaction(
  payload: ExactSvmPayloadV2,
  requirements: PaymentRequirements,
  signer: FacilitatorSvmSigner,
  payer: string,
  network: Network,
): Promise<SettleResponse> {
  const feePayer = requirements.extra!.feePayer as Address;
  const rpc = createRpcClient(network as `${string}:${string}`);

  try {
    // Send main transaction
    const fullySignedTransaction = await signer.signTransaction(
      payload.transaction,
      feePayer,
      network,
    );

    const signature = await signer.sendTransaction(fullySignedTransaction, network);
    await signer.confirmTransaction(signature, network);

    return {
      success: true,
      transaction: signature,
      network,
      payer,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Failed to settle Light Token transaction:", error);
    return {
      success: false,
      errorReason: "light_token_transaction_failed",
      errorMessage,
      transaction: "",
      network,
      payer,
    };
  }
}
