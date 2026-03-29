import {
  getBase64Encoder,
  getTransactionDecoder,
  getCompiledTransactionMessageDecoder,
  type Transaction,
  createSolanaRpc,
  devnet,
  testnet,
  mainnet,
  getProgramDerivedAddress,
  getAddressEncoder,
  type Address,
  type RpcDevnet,
  type SolanaRpcApiDevnet,
  type RpcTestnet,
  type SolanaRpcApiTestnet,
  type RpcMainnet,
  type SolanaRpcApiMainnet,
} from "@solana/kit";
import { TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import { TOKEN_2022_PROGRAM_ADDRESS } from "@solana-program/token-2022";
import type { Network } from "@x402/core/types";
import {
  SVM_ADDRESS_REGEX,
  DEVNET_RPC_URL,
  TESTNET_RPC_URL,
  MAINNET_RPC_URL,
  USDC_MAINNET_ADDRESS,
  USDC_DEVNET_ADDRESS,
  USDC_TESTNET_ADDRESS,
  SOLANA_MAINNET_CAIP2,
  SOLANA_DEVNET_CAIP2,
  SOLANA_TESTNET_CAIP2,
  V1_TO_V2_NETWORK_MAP,
  LIGHT_TOKEN_PROGRAM_ADDRESS,
  LIGHT_TOKEN_DISC_TRANSFER_CHECKED,
} from "./constants";
import type { ExactSvmPayloadV1 } from "./types";

/**
 * Normalize network identifier to CAIP-2 format
 * Handles both V1 names (solana, solana-devnet) and V2 CAIP-2 format
 *
 * @param network - Network identifier (V1 or V2 format)
 * @returns CAIP-2 network identifier
 */
export function normalizeNetwork(network: Network): string {
  // If it's already CAIP-2 format (contains ":"), validate it's supported
  if (network.includes(":")) {
    const supported = [SOLANA_MAINNET_CAIP2, SOLANA_DEVNET_CAIP2, SOLANA_TESTNET_CAIP2];
    if (!supported.includes(network)) {
      throw new Error(`Unsupported SVM network: ${network}`);
    }
    return network;
  }

  // Otherwise, it's a V1 network name, convert to CAIP-2
  const caip2Network = V1_TO_V2_NETWORK_MAP[network];
  if (!caip2Network) {
    throw new Error(`Unsupported SVM network: ${network}`);
  }
  return caip2Network;
}

/**
 * Validate Solana address format
 *
 * @param address - Base58 encoded address string
 * @returns true if address is valid, false otherwise
 */
export function validateSvmAddress(address: string): boolean {
  return SVM_ADDRESS_REGEX.test(address);
}

/**
 * Decode a base64 encoded transaction from an SVM payload
 *
 * @param svmPayload - The SVM payload containing a base64 encoded transaction
 * @returns Decoded Transaction object
 */
export function decodeTransactionFromPayload(svmPayload: ExactSvmPayloadV1): Transaction {
  try {
    const base64Encoder = getBase64Encoder();
    const transactionBytes = base64Encoder.encode(svmPayload.transaction);
    const transactionDecoder = getTransactionDecoder();
    return transactionDecoder.decode(transactionBytes);
  } catch (error) {
    console.error("Error decoding transaction:", error);
    throw new Error("invalid_exact_svm_payload_transaction");
  }
}

/**
 * Extract the token sender (owner of the source token account) from a TransferChecked instruction
 *
 * @param transaction - The decoded transaction
 * @returns The token payer address as a base58 string
 */
export function getTokenPayerFromTransaction(transaction: Transaction): string {
  const compiled = getCompiledTransactionMessageDecoder().decode(transaction.messageBytes);
  const staticAccounts = compiled.staticAccounts ?? [];
  const instructions = compiled.instructions ?? [];

  for (const ix of instructions) {
    const programIndex = ix.programAddressIndex;
    const programAddress = staticAccounts[programIndex].toString();

    // Check if this is a token program instruction
    if (
      programAddress === TOKEN_PROGRAM_ADDRESS.toString() ||
      programAddress === TOKEN_2022_PROGRAM_ADDRESS.toString()
    ) {
      const accountIndices: number[] = ix.accountIndices ?? [];
      // TransferChecked account order: [source, mint, destination, owner, ...]
      if (accountIndices.length >= 4) {
        const ownerIndex = accountIndices[3];
        const ownerAddress = staticAccounts[ownerIndex].toString();
        if (ownerAddress) return ownerAddress;
      }
    }

    // Light Token: disc 12 (TransferChecked) has same account layout
    if (programAddress === LIGHT_TOKEN_PROGRAM_ADDRESS) {
      const accountIndices: number[] = ix.accountIndices ?? [];
      const disc = ix.data?.[0];
      if (disc === LIGHT_TOKEN_DISC_TRANSFER_CHECKED && accountIndices.length >= 4) {
        return staticAccounts[accountIndices[3]].toString();
      }
    }
  }

  return "";
}

/**
 * Create an RPC client for the specified network
 *
 * @param network - Network identifier (CAIP-2 or V1 format)
 * @param customRpcUrl - Optional custom RPC URL
 * @returns RPC client for the specified network
 */
export function createRpcClient(
  network: Network,
  customRpcUrl?: string,
):
  | RpcDevnet<SolanaRpcApiDevnet>
  | RpcTestnet<SolanaRpcApiTestnet>
  | RpcMainnet<SolanaRpcApiMainnet> {
  const caip2Network = normalizeNetwork(network);

  switch (caip2Network) {
    case SOLANA_DEVNET_CAIP2: {
      const url = customRpcUrl || DEVNET_RPC_URL;
      return createSolanaRpc(devnet(url)) as RpcDevnet<SolanaRpcApiDevnet>;
    }
    case SOLANA_TESTNET_CAIP2: {
      const url = customRpcUrl || TESTNET_RPC_URL;
      return createSolanaRpc(testnet(url)) as RpcTestnet<SolanaRpcApiTestnet>;
    }
    case SOLANA_MAINNET_CAIP2: {
      const url = customRpcUrl || MAINNET_RPC_URL;
      return createSolanaRpc(mainnet(url)) as RpcMainnet<SolanaRpcApiMainnet>;
    }
    default:
      throw new Error(`Unsupported network: ${network}`);
  }
}

/**
 * Get the default USDC mint address for a network
 *
 * @param network - Network identifier (CAIP-2 or V1 format)
 * @returns USDC mint address for the network
 */
export function getUsdcAddress(network: Network): string {
  const caip2Network = normalizeNetwork(network);

  switch (caip2Network) {
    case SOLANA_MAINNET_CAIP2:
      return USDC_MAINNET_ADDRESS;
    case SOLANA_DEVNET_CAIP2:
      return USDC_DEVNET_ADDRESS;
    case SOLANA_TESTNET_CAIP2:
      return USDC_TESTNET_ADDRESS;
    default:
      throw new Error(`No USDC address configured for network: ${network}`);
  }
}

/**
 * Convert a decimal amount to token smallest units
 *
 * @param decimalAmount - The decimal amount (e.g., "0.10")
 * @param decimals - The number of decimals for the token (e.g., 6 for USDC)
 * @returns The amount in smallest units as a string
 */
export function convertToTokenAmount(decimalAmount: string, decimals: number): string {
  const amount = parseFloat(decimalAmount);
  if (isNaN(amount)) {
    throw new Error(`Invalid amount: ${decimalAmount}`);
  }
  // Convert to smallest unit (e.g., for USDC with 6 decimals: 0.10 * 10^6 = 100000)
  const [intPart, decPart = ""] = String(amount).split(".");
  const paddedDec = decPart.padEnd(decimals, "0").slice(0, decimals);
  const tokenAmount = (intPart + paddedDec).replace(/^0+/, "") || "0";
  return tokenAmount;
}

// ---------------------------------------------------------------------------
// Light Token utilities
// ---------------------------------------------------------------------------

/**
 * Account role constants matching @solana/kit's AccountRole enum.
 */
const ACCOUNT_ROLE_READONLY = 0;
const ACCOUNT_ROLE_WRITABLE = 1;
const ACCOUNT_ROLE_READONLY_SIGNER = 2;
const ACCOUNT_ROLE_WRITABLE_SIGNER = 3;

/**
 * Convert a @solana/web3.js v1 TransactionInstruction to a @solana/kit v2 IInstruction shape.
 * Used to bridge the Light Protocol SDK (v1 types) into x402's v2 transaction pipeline.
 *
 * @param ix - A web3.js v1 TransactionInstruction
 * @returns An object matching @solana/kit's IInstruction shape
 */
export function convertV1InstructionToV2(ix: {
  programId: { toBase58(): string };
  keys: ReadonlyArray<{
    pubkey: { toBase58(): string };
    isSigner: boolean;
    isWritable: boolean;
  }>;
  data: Buffer | Uint8Array;
}): {
  programAddress: Address;
  accounts: Array<{ address: Address; role: number }>;
  data: Uint8Array;
} {
  return {
    programAddress: ix.programId.toBase58() as Address,
    accounts: ix.keys.map(k => ({
      address: k.pubkey.toBase58() as Address,
      role: k.isSigner
        ? k.isWritable
          ? ACCOUNT_ROLE_WRITABLE_SIGNER
          : ACCOUNT_ROLE_READONLY_SIGNER
        : k.isWritable
          ? ACCOUNT_ROLE_WRITABLE
          : ACCOUNT_ROLE_READONLY,
    })),
    data: ix.data instanceof Uint8Array ? ix.data : new Uint8Array(ix.data),
  };
}

/**
 * Parsed Light Token transfer instruction data
 */
export interface ParsedLightTokenTransfer {
  discriminator: number;
  amount: bigint;
  decimals: number;
  source: string;
  mint: string | null;
  destination: string;
  authority: string;
  payer?: string;
}

/**
 * Parse a Light Token TransferChecked (disc 12) instruction.
 * Wire format: [disc(1), amount(u64 LE, 8), decimals(u8, 1)] = 10 bytes minimum.
 * Account order: [source, mint, dest, authority, system?, payer?]
 *
 * @param instruction - The decompiled instruction
 * @returns Parsed transfer data
 */
export function parseLightTokenTransferInstruction(instruction: {
  programAddress: { toString(): string };
  data?: Readonly<Uint8Array>;
  accounts?: ReadonlyArray<{ address: { toString(): string } }>;
}): ParsedLightTokenTransfer {
  if (!instruction.data || instruction.data.length < 10) {
    throw new Error("invalid_light_token_instruction_data");
  }

  const disc = instruction.data[0];
  if (disc !== LIGHT_TOKEN_DISC_TRANSFER_CHECKED) {
    throw new Error("invalid_light_token_discriminator");
  }

  const dataView = new DataView(
    instruction.data.buffer,
    instruction.data.byteOffset,
    instruction.data.byteLength,
  );
  const amount = dataView.getBigUint64(1, true);
  const decimals = instruction.data[9];
  const accounts = instruction.accounts ?? [];

  if (accounts.length < 4) {
    throw new Error("invalid_light_token_instruction_accounts");
  }

  return {
    discriminator: disc,
    amount,
    decimals,
    source: accounts[0].address.toString(),
    mint: accounts[1].address.toString(),
    destination: accounts[2].address.toString(),
    authority: accounts[3].address.toString(),
    payer: accounts.length > 5 ? accounts[5].address.toString() : undefined,
  };
}

/**
 * Derive the Light Token ATA PDA for a given owner and mint.
 * Seeds: [owner, LIGHT_TOKEN_PROGRAM_ID, mint]
 *
 * @param owner - The owner address
 * @param mint - The mint address
 * @returns The derived ATA address
 */
export async function deriveLightTokenATA(owner: string, mint: string): Promise<Address> {
  const addressEncoder = getAddressEncoder();
  const [address] = await getProgramDerivedAddress({
    programAddress: LIGHT_TOKEN_PROGRAM_ADDRESS as Address,
    seeds: [
      addressEncoder.encode(owner as Address),
      addressEncoder.encode(LIGHT_TOKEN_PROGRAM_ADDRESS as Address),
      addressEncoder.encode(mint as Address),
    ],
  });
  return address;
}

/**
 * Resolve the RPC URL for a given network.
 * Used to construct Light Protocol RPC clients that need a raw URL string.
 *
 * @param network - Network identifier (CAIP-2 or V1 format)
 * @param customRpcUrl - Optional custom RPC URL override
 * @returns The resolved RPC endpoint URL
 */
export function getRpcUrl(network: Network, customRpcUrl?: string): string {
  if (customRpcUrl) return customRpcUrl;
  const caip2Network = normalizeNetwork(network);
  switch (caip2Network) {
    case SOLANA_DEVNET_CAIP2:
      return DEVNET_RPC_URL;
    case SOLANA_TESTNET_CAIP2:
      return TESTNET_RPC_URL;
    case SOLANA_MAINNET_CAIP2:
      return MAINNET_RPC_URL;
    default:
      throw new Error(`Unsupported network: ${network}`);
  }
}
