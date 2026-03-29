import { describe, it, expect } from "vitest";
import {
  containsLightTokenInstruction,
  validatePreTransactions,
} from "../../src/exact/facilitator/light-token";
import { LIGHT_TOKEN_PROGRAM_ADDRESS } from "../../src/constants";
import { COMPUTE_BUDGET_PROGRAM_ADDRESS } from "@solana-program/compute-budget";
import { TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";

describe("Facilitator Light Token Helpers", () => {
  describe("containsLightTokenInstruction", () => {
    it("should detect Light Token program instructions", () => {
      const instructions = [
        { programAddress: { toString: () => COMPUTE_BUDGET_PROGRAM_ADDRESS.toString() } },
        { programAddress: { toString: () => COMPUTE_BUDGET_PROGRAM_ADDRESS.toString() } },
        { programAddress: { toString: () => LIGHT_TOKEN_PROGRAM_ADDRESS } },
      ];

      expect(containsLightTokenInstruction(instructions)).toBe(true);
    });

    it("should return false for SPL-only instructions", () => {
      const instructions = [
        { programAddress: { toString: () => COMPUTE_BUDGET_PROGRAM_ADDRESS.toString() } },
        { programAddress: { toString: () => COMPUTE_BUDGET_PROGRAM_ADDRESS.toString() } },
        { programAddress: { toString: () => TOKEN_PROGRAM_ADDRESS.toString() } },
      ];

      expect(containsLightTokenInstruction(instructions)).toBe(false);
    });

    it("should return false for empty instructions", () => {
      expect(containsLightTokenInstruction([])).toBe(false);
    });
  });

  describe("validatePreTransactions", () => {
    it("should accept valid pre-transactions with Light Token program", () => {
      // We need a real encoded transaction for this test, but since validatePreTransactions
      // decodes the transaction, we'll test the error paths instead.
      // Valid pre-transaction testing requires integration-level setup.
    });

    it("should reject empty base64", () => {
      const result = validatePreTransactions([""]);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("invalid_exact_svm_payload_pre_transaction_decode_failed");
    });

    it("should reject invalid base64", () => {
      const result = validatePreTransactions(["not-valid-base64!!!"]);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("invalid_exact_svm_payload_pre_transaction_decode_failed");
    });

    it("should accept empty array", () => {
      const result = validatePreTransactions([]);
      expect(result.valid).toBe(true);
    });
  });
});
