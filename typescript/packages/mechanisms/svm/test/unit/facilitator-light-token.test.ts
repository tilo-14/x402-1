import { describe, it, expect } from "vitest";
import { containsLightTokenInstruction } from "../../src/exact/facilitator/light-token";
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
});
