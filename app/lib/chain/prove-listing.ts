"use client";

import { Group, generateProof } from "@semaphore-protocol/core";
import { encodePacked, keccak256 } from "viem";
import { readIdentity, toIdentity } from "./owner-identity";

/**
 * Builds a listing proof in the owner's browser.
 *
 * The identity secret never leaves the device: the server receives only a proof, which
 * shows the lister holds *an* approved commitment without revealing which. That is why
 * this runs client-side despite being slower than doing it on the server.
 *
 * The first call downloads Semaphore's proving artifacts (a few MB) and can take tens
 * of seconds; callers should say so rather than appear to hang.
 */

export interface ListingTerms {
  /** Stable private tag for the room; becomes the on-chain roomTag via the nullifier. */
  room: bigint;
  start: bigint;
  end: bigint;
  /** USDC with 6 decimals. */
  price: bigint;
  payout: `0x${string}`;
}

export interface ListingProof {
  merkleTreeDepth: string; merkleTreeRoot: string; nullifier: string;
  message: string; scope: string; points: string[];
}

/** Derives a stable room tag from the owner's seed and a room label. */
export function roomTag(seed: string, roomLabel: string): bigint {
  // Truncated to 64 bits: enough to be unique per room, and the scope only needs to be
  // stable and unguessable, not wide.
  return BigInt(keccak256(encodePacked(["string"], [`${seed}:${roomLabel}`])).slice(0, 18));
}

export class NoIdentityError extends Error {
  constructor() {
    super("no_identity");
  }
}

/**
 * Mirrors RentalRegistry.listingMessage: the proof is bound to these exact terms, so
 * the published listing cannot differ from what the owner proved.
 */
function listingMessage(terms: ListingTerms): bigint {
  return BigInt(
    keccak256(
      encodePacked(
        ["uint256", "uint64", "uint64", "uint256", "address"],
        [terms.room, terms.start, terms.end, terms.price, terms.payout],
      ),
    ),
  );
}

export async function proveListing(terms: ListingTerms): Promise<ListingProof> {
  const record = readIdentity();
  if (!record) throw new NoIdentityError();

  const res = await fetch("/api/group");
  if (!res.ok) throw new Error("group_unavailable");
  const { members, root } = (await res.json()) as { members: string[]; root: string };

  const group = new Group(members);
  if (group.root.toString() !== root) {
    // The rebuilt tree disagrees with the chain, so any proof would be rejected. This
    // usually means an approval landed between the two reads.
    throw new Error("stale_group");
  }

  const proof = await generateProof(
    toIdentity(record),
    group,
    listingMessage(terms),
    terms.room,
  );

  return {
    merkleTreeDepth: proof.merkleTreeDepth.toString(),
    merkleTreeRoot: proof.merkleTreeRoot.toString(),
    nullifier: proof.nullifier.toString(),
    message: proof.message.toString(),
    scope: proof.scope.toString(),
    points: proof.points.map(String),
  };
}

export function explainListingError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("no_identity")) {
    return "This device has no owner identity. Submit a property application first.";
  }
  if (message.includes("approval_already_used")) {
    return "This room has already been listed under its approval. An approval is single-use: re-apply to list it again.";
  }
  if (message.includes("stale_group")) {
    return "The approved set changed while preparing the proof. Try again.";
  }
  if (message.includes("terms_mismatch")) {
    return "The listing terms do not match the proof.";
  }
  if (message.includes("invalid_period")) return "That period is not valid.";
  return "The listing could not be published. Nothing was recorded.";
}
