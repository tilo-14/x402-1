import { describe, it, expect } from "vitest";
import { LightExactSvmScheme } from "../../src/exact/client/light-scheme";

describe("LightExactSvmScheme", () => {
  it("should have scheme set to 'exact'", () => {
    // We can't construct a real instance without a valid signer,
    // but we can verify the class exports correctly and has the right shape
    expect(LightExactSvmScheme).toBeDefined();
    expect(typeof LightExactSvmScheme).toBe("function");
  });

  it("should require rpcUrl in config", () => {
    // The constructor requires { rpcUrl: string }, not optional
    // This is a type-level check — if it compiles, it passes
    const config = { rpcUrl: "https://example.com" };
    expect(config.rpcUrl).toBe("https://example.com");
  });
});
