import { NextResponse } from "next/server";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hederaTestnet, publicClient, registryAddress } from "@/lib/chain/registry";

/**
 * Publishes a listing from a proof the owner generated on their own device.
 *
 * The proof is the authorisation: createListing checks it against the approved set, so
 * whoever submits the transaction cannot forge a listing. The server relays it only so
 * the owner does not need HBAR for gas -- it learns nothing that would let it list on
 * their behalf.
 */

const CREATE_LISTING_ABI = [
  {
    type: "function", name: "createListing", stateMutability: "nonpayable",
    inputs: [
      { name: "proof", type: "tuple", components: [
        { name: "merkleTreeDepth", type: "uint256" },
        { name: "merkleTreeRoot", type: "uint256" },
        { name: "nullifier", type: "uint256" },
        { name: "message", type: "uint256" },
        { name: "scope", type: "uint256" },
        { name: "points", type: "uint256[8]" },
      ] },
      { name: "start", type: "uint64" },
      { name: "end", type: "uint64" },
      { name: "price", type: "uint256" },
      { name: "payout", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  { type: "error", name: "TermsNotBoundToProof", inputs: [] },
  { type: "error", name: "RoomAlreadyListed", inputs: [] },
  { type: "error", name: "InvalidPeriod", inputs: [] },
  { type: "error", name: "InvalidPrice", inputs: [] },
  { type: "error", name: "InvalidPayout", inputs: [] },
] as const;

// A listing issues its ATS token in the same transaction, which measured about 7.9M gas
// on testnet. The limit needs headroom, because the proof check grows with the group.
const GAS = 10_000_000n;

interface ProofBody {
  merkleTreeDepth: string; merkleTreeRoot: string; nullifier: string;
  message: string; scope: string; points: string[];
}

export async function POST(request: Request) {
  let body: { proof?: ProofBody; start?: number; end?: number; price?: string; payout?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const { proof, start, end, price, payout } = body;
  if (!proof || !start || !end || !price || !payout || proof.points?.length !== 8) {
    return NextResponse.json({ error: "invalid_listing" }, { status: 400 });
  }

  const key = process.env.REGISTRAR_PRIVATE_KEY;
  if (!key) return NextResponse.json({ error: "relay_unavailable" }, { status: 500 });

  const account = privateKeyToAccount(key as `0x${string}`);
  const address = registryAddress();
  const args = [
    {
      merkleTreeDepth: BigInt(proof.merkleTreeDepth),
      merkleTreeRoot: BigInt(proof.merkleTreeRoot),
      nullifier: BigInt(proof.nullifier),
      message: BigInt(proof.message),
      scope: BigInt(proof.scope),
      points: proof.points.map(BigInt) as unknown as readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint],
    },
    BigInt(start), BigInt(end), BigInt(price), payout as `0x${string}`,
  ] as const;

  try {
    // Simulate first: an invalid or already-used proof should fail here, before a
    // transaction is paid for.
    await publicClient().simulateContract({
      address, abi: CREATE_LISTING_ABI, functionName: "createListing",
      args, account, gas: GAS,
    });

    const wallet = createWalletClient({ account, chain: hederaTestnet, transport: http() });
    const hash = await wallet.writeContract({
      address, abi: CREATE_LISTING_ABI, functionName: "createListing",
      args, gas: GAS, chain: hederaTestnet,
    });
    const receipt = await publicClient().waitForTransactionReceipt({ hash, timeout: 150_000 });
    if (receipt.status !== "success") {
      return NextResponse.json({ error: "listing_reverted" }, { status: 502 });
    }

    return NextResponse.json({
      ok: true, transactionHash: hash,
      explorer: `https://hashscan.io/testnet/transaction/${hash}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[listings] createListing failed:", message);

    // Semaphore__YouAreUsingTheSameNullifierTwice: an approval is single-use, so this
    // means the room has already been listed under this approval.
    if (message.includes("SameNullifierTwice") || message.includes("0x208b15e8")) {
      return NextResponse.json({ error: "approval_already_used" }, { status: 409 });
    }
    if (message.includes("TermsNotBoundToProof")) {
      return NextResponse.json({ error: "terms_mismatch" }, { status: 400 });
    }
    if (message.includes("InvalidPeriod")) {
      return NextResponse.json({ error: "invalid_period" }, { status: 400 });
    }
    if (message.includes("MerkleTreeRoot")) {
      return NextResponse.json({ error: "stale_group" }, { status: 409 });
    }
    return NextResponse.json({ error: "listing_failed" }, { status: 502 });
  }
}
