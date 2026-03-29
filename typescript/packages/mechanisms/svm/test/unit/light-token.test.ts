import { describe, it, expect } from "vitest";
import {
  parseLightTokenTransferInstruction,
  deriveLightTokenATA,
  getRpcUrl,
} from "../../src/utils";
import {
  LIGHT_TOKEN_PROGRAM_ADDRESS,
  LIGHT_TOKEN_DISC_TRANSFER_CHECKED,
  SOLANA_DEVNET_CAIP2,
  SOLANA_MAINNET_CAIP2,
  SOLANA_TESTNET_CAIP2,
  DEVNET_RPC_URL,
  MAINNET_RPC_URL,
  TESTNET_RPC_URL,
} from "../../src/constants";

describe("Light Token Utilities", () => {
  describe("parseLightTokenTransferInstruction", () => {
    it("should parse a valid disc 12 instruction", () => {
      // disc(1) + amount(u64 LE, 8) + decimals(u8, 1) = 10 bytes
      const data = new Uint8Array(10);
      data[0] = LIGHT_TOKEN_DISC_TRANSFER_CHECKED; // disc 12
      const view = new DataView(data.buffer);
      view.setBigUint64(1, BigInt(1_000_000), true); // 1 USDC
      data[9] = 6; // decimals

      const accounts = [
        { address: { toString: () => "Source1111111111111111111111111111" } },
        { address: { toString: () => "Mint11111111111111111111111111111" } },
        { address: { toString: () => "Dest111111111111111111111111111111" } },
        { address: { toString: () => "Auth111111111111111111111111111111" } },
      ];

      const parsed = parseLightTokenTransferInstruction({
        programAddress: { toString: () => LIGHT_TOKEN_PROGRAM_ADDRESS },
        data,
        accounts,
      });

      expect(parsed.discriminator).toBe(12);
      expect(parsed.amount).toBe(BigInt(1_000_000));
      expect(parsed.decimals).toBe(6);
      expect(parsed.source).toBe("Source1111111111111111111111111111");
      expect(parsed.mint).toBe("Mint11111111111111111111111111111");
      expect(parsed.destination).toBe("Dest111111111111111111111111111111");
      expect(parsed.authority).toBe("Auth111111111111111111111111111111");
      expect(parsed.payer).toBeUndefined();
    });

    it("should extract payer when present at account index 5", () => {
      const data = new Uint8Array(10);
      data[0] = LIGHT_TOKEN_DISC_TRANSFER_CHECKED;
      const view = new DataView(data.buffer);
      view.setBigUint64(1, BigInt(100), true);
      data[9] = 6;

      const accounts = [
        { address: { toString: () => "Source" } },
        { address: { toString: () => "Mint" } },
        { address: { toString: () => "Dest" } },
        { address: { toString: () => "Auth" } },
        { address: { toString: () => "System" } },
        { address: { toString: () => "Payer" } },
      ];

      const parsed = parseLightTokenTransferInstruction({
        programAddress: { toString: () => LIGHT_TOKEN_PROGRAM_ADDRESS },
        data,
        accounts,
      });

      expect(parsed.payer).toBe("Payer");
    });

    it("should throw on insufficient data length", () => {
      expect(() =>
        parseLightTokenTransferInstruction({
          programAddress: { toString: () => LIGHT_TOKEN_PROGRAM_ADDRESS },
          data: new Uint8Array(5),
          accounts: [],
        }),
      ).toThrow("invalid_light_token_instruction_data");
    });

    it("should throw on wrong discriminator", () => {
      const data = new Uint8Array(10);
      data[0] = 99; // wrong disc

      expect(() =>
        parseLightTokenTransferInstruction({
          programAddress: { toString: () => LIGHT_TOKEN_PROGRAM_ADDRESS },
          data,
          accounts: [],
        }),
      ).toThrow("invalid_light_token_discriminator");
    });

    it("should throw on insufficient accounts", () => {
      const data = new Uint8Array(10);
      data[0] = LIGHT_TOKEN_DISC_TRANSFER_CHECKED;

      expect(() =>
        parseLightTokenTransferInstruction({
          programAddress: { toString: () => LIGHT_TOKEN_PROGRAM_ADDRESS },
          data,
          accounts: [{ address: { toString: () => "Only1" } }],
        }),
      ).toThrow("invalid_light_token_instruction_accounts");
    });
  });

  describe("deriveLightTokenATA", () => {
    it("should derive a deterministic address", async () => {
      const owner = "11111111111111111111111111111112";
      const mint = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

      const address1 = await deriveLightTokenATA(owner, mint);
      const address2 = await deriveLightTokenATA(owner, mint);

      expect(address1).toBe(address2);
      expect(typeof address1).toBe("string");
      expect(address1.length).toBeGreaterThan(0);
    });

    it("should produce different addresses for different owners", async () => {
      const mint = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
      // Use real 32-byte base58 addresses
      const address1 = await deriveLightTokenATA("11111111111111111111111111111112", mint);
      const address2 = await deriveLightTokenATA(
        "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
        mint,
      );

      expect(address1).not.toBe(address2);
    });
  });

  describe("getRpcUrl", () => {
    it("should return custom URL when provided", () => {
      expect(getRpcUrl(SOLANA_DEVNET_CAIP2, "https://custom.rpc.com")).toBe(
        "https://custom.rpc.com",
      );
    });

    it("should return default devnet URL", () => {
      expect(getRpcUrl(SOLANA_DEVNET_CAIP2)).toBe(DEVNET_RPC_URL);
    });

    it("should return default mainnet URL", () => {
      expect(getRpcUrl(SOLANA_MAINNET_CAIP2)).toBe(MAINNET_RPC_URL);
    });

    it("should return default testnet URL", () => {
      expect(getRpcUrl(SOLANA_TESTNET_CAIP2)).toBe(TESTNET_RPC_URL);
    });

    it("should handle V1 network names", () => {
      expect(getRpcUrl("solana-devnet")).toBe(DEVNET_RPC_URL);
    });

    it("should throw on unsupported network", () => {
      expect(() => getRpcUrl("unsupported:network")).toThrow("Unsupported SVM network");
    });
  });
});
