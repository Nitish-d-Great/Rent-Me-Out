import { NextResponse } from "next/server";
import { createWalletClient, http, parseEventLogs } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hederaTestnet, invalidateRooms, publicClient, registryAddress } from "@/lib/chain/registry";
import { indexListing } from "@/lib/arkiv/listings";

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
      { name: "latitudeE6", type: "int32" },
      { name: "longitudeE6", type: "int32" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "event", name: "RoomTokenIssued", anonymous: false,
    inputs: [
      { name: "listingId", type: "uint256", indexed: true },
      { name: "token", type: "address", indexed: true },
    ],
  },
  { type: "error", name: "TermsNotBoundToProof", inputs: [] },
  { type: "error", name: "RoomAlreadyListed", inputs: [] },
  { type: "error", name: "InvalidPeriod", inputs: [] },
  { type: "error", name: "InvalidPrice", inputs: [] },
  { type: "error", name: "InvalidPayout", inputs: [] },
  { type: "error", name: "InvalidCoordinates", inputs: [] },
] as const;

// A listing issues its ATS token in the same transaction, which measured about 7.9M gas
// on testnet. The limit needs headroom, because the proof check grows with the group.
const GAS = 10_000_000n;

interface ProofBody {
  merkleTreeDepth: string; merkleTreeRoot: string; nullifier: string;
  message: string; scope: string; points: string[];
}

export async function POST(request: Request) {
  let body: {
    proof?: ProofBody; start?: number; end?: number; price?: string; payout?: string;
    city?: string; label?: string; latitudeE6?: number; longitudeE6?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const { proof, start, end, price, payout, latitudeE6, longitudeE6 } = body;
  if (
    !proof || !start || !end || !price || !payout || proof.points?.length !== 8 ||
    !Number.isInteger(latitudeE6) || !Number.isInteger(longitudeE6) ||
    latitudeE6! < -90_000_000 || latitudeE6! > 90_000_000 ||
    longitudeE6! < -180_000_000 || longitudeE6! > 180_000_000
  ) {
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
    BigInt(start), BigInt(end), BigInt(price), payout as `0x${string}`, latitudeE6!, longitudeE6!,
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

    const [issued] = parseEventLogs({
      abi: CREATE_LISTING_ABI, eventName: "RoomTokenIssued", logs: receipt.logs,
    });
    const listingId = issued?.args.listingId;
    const token = issued?.args.token;

    // The room now exists on Hedera whatever happens next, so a failed index write is
    // reported as "not indexed" rather than as a failed listing.
    let indexed = false;
    if (listingId !== undefined && token) {
      try {
        await indexListing({
          listingId,
          city: (body.city ?? "").trim().slice(0, 60) || "Unspecified",
          label: (body.label ?? "").trim().slice(0, 60) || `Room ${listingId}`,
          priceUsdc: BigInt(price),
          startsAt: start,
          endsAt: end,
          payout: payout as `0x${string}`,
          token,
          listingTx: hash,
        });
        indexed = true;
      } catch (error) {
        console.error("[listings] not indexed on Arkiv:", error);
      }
    }
    invalidateRooms();

    return NextResponse.json({
      ok: true, transactionHash: hash, indexed,
      listingId: listingId?.toString(), token,
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
