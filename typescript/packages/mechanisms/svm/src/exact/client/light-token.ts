import { PublicKey } from "@solana/web3.js";
import {
  createTransferInterfaceInstructions,
  getAssociatedTokenAddressInterface,
  getAtaInterface,
} from "@lightprotocol/compressed-token/unified";
import { createRpc } from "@lightprotocol/stateless.js";
import {
  appendTransactionMessageInstructions,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  partiallySignTransactionMessageWithSigners,
  pipe,
  setTransactionMessageComputeUnitPrice,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  type Address,
} from "@solana/kit";
import type { PaymentRequirements } from "@x402/core/types";
import {
  DEFAULT_COMPUTE_UNIT_PRICE_MICROLAMPORTS,
  MEMO_PROGRAM_ADDRESS,
} from "../../constants";
import type { ClientSvmSigner } from "../../signer";
import type { ExactSvmPayloadV2 } from "../../types";
import { convertV1InstructionToV2, getRpcUrl } from "../../utils";

/**
 * Account role constants for signer injection
 */
const ACCOUNT_ROLE_READONLY_SIGNER = 2;
const ACCOUNT_ROLE_WRITABLE_SIGNER = 3;

/**
 * Build a Light Token payment payload.
 * Returns null if the source has no compressed token balance for the given mint.
 *
 * @param signer - The client signer
 * @param rpcUrl - Photon-compatible RPC URL
 * @param paymentRequirements - The payment requirements
 * @returns Light Token payment payload, or null if no compressed balance
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

  // Check compressed balance via unified interface
  const senderAta = getAssociatedTokenAddressInterface(mint, sender);
  const account = await getAtaInterface(lightRpc, senderAta, sender, mint);
  const balance = BigInt(account.parsed.amount.toString());

  if (balance < BigInt(paymentRequirements.amount)) {
    return null;
  }

  const feePayer = paymentRequirements.extra?.feePayer as Address;
  if (!feePayer) {
    throw new Error("feePayer is required in paymentRequirements.extra for SVM transactions");
  }

  const payer = new PublicKey(feePayer);

  // SDK returns TransactionInstruction[][] — each inner array is one atomic tx
  const ixBatches = await createTransferInterfaceInstructions(
    lightRpc,
    payer,
    mint,
    BigInt(paymentRequirements.amount),
    sender,
    destination,
  );

  if (ixBatches.length === 0) {
    throw new Error("Light Token SDK returned no instruction batches");
  }

  // Convert all batches: v1 TransactionInstruction -> v2 IInstruction
  // Inject client signer where the address matches
  const clientAddress = signer.address as string;
  const v2Batches = ixBatches.map(batch =>
    batch.map(ix => {
      const v2 = convertV1InstructionToV2(ix);
      return {
        ...v2,
        accounts: v2.accounts.map(acct => {
          if (
            acct.address === clientAddress &&
            (acct.role === ACCOUNT_ROLE_READONLY_SIGNER ||
              acct.role === ACCOUNT_ROLE_WRITABLE_SIGNER)
          ) {
            return { address: acct.address, role: acct.role, signer };
          }
          return acct;
        }),
      };
    }),
  );

  // Last batch = payment tx (transfer), preceding = pre-transactions (loads)
  const transferBatch = v2Batches[v2Batches.length - 1];
  const preBatches = v2Batches.slice(0, -1);

  const rpc = lightRpc as unknown as { getLatestBlockhash(): { send(): Promise<{ value: { blockhash: string; lastValidBlockHeight: bigint } }> } };
  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

  // Build pre-transactions (load instructions)
  const preTransactions: string[] = [];
  for (const batch of preBatches) {
    const preTx = pipe(
      createTransactionMessage({ version: 0 }),
      tx => setTransactionMessageFeePayer(feePayer, tx),
      tx => appendTransactionMessageInstructions(batch, tx),
      tx => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
    );
    const signed = await partiallySignTransactionMessageWithSigners(preTx);
    preTransactions.push(getBase64EncodedWireTransaction(signed));
  }

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

  // Build the main payment tx
  const paymentTx = pipe(
    createTransactionMessage({ version: 0 }),
    tx => setTransactionMessageComputeUnitPrice(DEFAULT_COMPUTE_UNIT_PRICE_MICROLAMPORTS, tx),
    tx => setTransactionMessageFeePayer(feePayer, tx),
    tx => appendTransactionMessageInstructions([...transferBatch, memoIx], tx),
    tx => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
  );

  const signedPayment = await partiallySignTransactionMessageWithSigners(paymentTx);

  return {
    transaction: getBase64EncodedWireTransaction(signedPayment),
    ...(preTransactions.length > 0 && { preTransactions }),
  };
}
