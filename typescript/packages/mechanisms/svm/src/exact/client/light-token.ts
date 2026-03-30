import { PublicKey } from "@solana/web3.js";
import { createTransferInstructions, getAta } from "@lightprotocol/token-interface";
import { toKitInstructions } from "@lightprotocol/token-interface/kit";
import { createRpc } from "@lightprotocol/stateless.js";
import { setTransactionMessageComputeUnitPrice } from "@solana-program/compute-budget";
import {
  appendTransactionMessageInstructions,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  partiallySignTransactionMessageWithSigners,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  type Address,
} from "@solana/kit";
import type { PaymentRequirements } from "@x402/core/types";
import { DEFAULT_COMPUTE_UNIT_PRICE_MICROLAMPORTS, MEMO_PROGRAM_ADDRESS } from "../../constants";
import type { ClientSvmSigner } from "../../signer";
import type { ExactSvmPayloadV2 } from "../../types";

/** Account role: read-only signer */
const ACCOUNT_ROLE_READONLY_SIGNER = 2;
/** Account role: writable signer */
const ACCOUNT_ROLE_WRITABLE_SIGNER = 3;

/**
 * Build a Light Token payment payload.
 * Returns null if the source has no Light Token balance for the given mint.
 */
export async function buildLightTokenPayload(
  signer: ClientSvmSigner,
  rpcUrl: string,
  paymentRequirements: PaymentRequirements,
): Promise<ExactSvmPayloadV2 | null> {
  const lightRpc = createRpc(rpcUrl, rpcUrl, rpcUrl);
  const mint = new PublicKey(paymentRequirements.asset);
  const sender = new PublicKey(signer.address as string);
  const destination = new PublicKey(paymentRequirements.payTo);

  // Check Light Token balance (aggregated: hot + cold + SPL + Token-2022)
  const account = await getAta({ rpc: lightRpc, owner: sender, mint });
  const balance = account.amount;

  if (balance < BigInt(paymentRequirements.amount)) {
    return null;
  }

  const feePayer = paymentRequirements.extra?.feePayer as Address;
  if (!feePayer) {
    throw new Error("feePayer is required in paymentRequirements.extra for SVM transactions");
  }

  const payer = new PublicKey(feePayer);

  // SDK returns TransactionInstruction[] with auto-wrap of SPL/T22 into Light Token
  const v1Instructions = await createTransferInstructions({
    rpc: lightRpc,
    payer,
    mint,
    amount: BigInt(paymentRequirements.amount),
    sourceOwner: sender,
    authority: sender,
    recipient: destination,
  });

  if (v1Instructions.length === 0) {
    throw new Error("Light Token SDK returned no instructions");
  }

  // Convert v1 → v2 via /kit export, then inject client signer
  const v2Instructions = toKitInstructions(v1Instructions);
  const clientAddress = signer.address as string;
  const withSigner = v2Instructions.map(ix => ({
    ...ix,
    accounts: (ix as { accounts: Array<{ address: string; role: number }> }).accounts.map(acct => {
      if (
        acct.address === clientAddress &&
        (acct.role === ACCOUNT_ROLE_READONLY_SIGNER || acct.role === ACCOUNT_ROLE_WRITABLE_SIGNER)
      ) {
        return { address: acct.address, role: acct.role, signer };
      }
      return acct;
    }),
  }));

  const rpc = lightRpc as unknown as {
    getLatestBlockhash(): {
      send(): Promise<{ value: { blockhash: string; lastValidBlockHeight: bigint } }>;
    };
  };
  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

  // Build nonce memo for uniqueness
  const nonce = crypto.getRandomValues(new Uint8Array(16));
  const memoIx = {
    programAddress: MEMO_PROGRAM_ADDRESS as Address,
    accounts: [] as const,
    data: new TextEncoder().encode(
      Array.from(nonce)
        .map(b => b.toString(16).padStart(2, "0"))
        .join(""),
    ),
  };

  // Build the payment transaction
  const paymentTx = pipe(
    createTransactionMessage({ version: 0 }),
    tx => setTransactionMessageComputeUnitPrice(DEFAULT_COMPUTE_UNIT_PRICE_MICROLAMPORTS, tx),
    tx => setTransactionMessageFeePayer(feePayer, tx),
    tx => appendTransactionMessageInstructions([...withSigner, memoIx], tx),
    tx => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
  );

  const signedPayment = await partiallySignTransactionMessageWithSigners(paymentTx);

  return {
    transaction: getBase64EncodedWireTransaction(signedPayment),
  };
}
