import { NextResponse } from "next/server";
import {
  issueReceipt,
  sessionKey,
  serverConfig,
  verifyChallenge,
  verifySessionProof,
  unboundIdentityBindings,
  unboundRoomRights,
  type SessionResult,
  type SignedChallenge,
} from "@/lib/world";

const bindings = unboundIdentityBindings;
const rooms = unboundRoomRights;

interface Outcome {
  match: boolean;
  roomId: string;
  reason?: string;
  /**
   * Server-signed, opaque to the broker. Carried to the tenant's phone and checked at
   * POST /api/presence/:roomId/receipt. Issued for mismatches too, so a tenant can get
   * a definitive red rather than a timeout -- though a broker will simply not show one,
   * and the tenant's page treats a missing receipt as unverified.
   */
  receipt: string;
}

/**
 * The live broker check at a viewing.
 *
 * Four gates, in order, each failing closed:
 *   1. the signed challenge is authentic, for this room, and unexpired;
 *   2. the room has a current rights holder on-chain (and the rights are valid);
 *   3. World confirms the session proof, carrying this viewing's nonce;
 *   4. the proven session is bound on-chain to that holder.
 *
 * The holder comes from the chain, never from the request body -- a client could
 * otherwise nominate any wallet and be told it matches.
 *
 * Returns match/mismatch only. The raw proof is never stored, logged, or echoed, and
 * the broker's identity is never revealed to the tenant.
 *
 * HONEST LIMIT: this proves the presented session is bound to the rights holder. The
 * World docs do not guarantee a session proof is cryptographically bound to the human
 * who created the session, so it does not by itself prove the person present is that
 * human. Do not phrase the green state as more than "this broker holds the rights".
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const { roomId } = await params;

  const body = (await request.json()) as {
    challenge?: SignedChallenge;
    result?: SessionResult;
  };

  const { challengeSecret } = serverConfig();

  const respond = (match: boolean, reason?: string, status = 200) => {
    const nonce = body.challenge?.nonce ?? "";
    const receipt = issueReceipt(challengeSecret, {
      roomId,
      nonce,
      match,
      reason,
      issuedAt: Math.floor(Date.now() / 1000),
    });
    return NextResponse.json<Outcome>(
      { match, roomId, reason, receipt },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  };

  const fail = (reason: string, status = 200) => respond(false, reason, status);

  if (!body.challenge || !body.result) {
    return fail("malformed_request", 400);
  }

  // 1. challenge
  const challengeCheck = verifyChallenge(challengeSecret, body.challenge, roomId);
  if (!challengeCheck.ok) {
    return fail(`challenge_${challengeCheck.reason}`);
  }

  // 2. on-chain holder
  const holder = await rooms.holderOf(roomId);
  if (!holder) {
    return fail("no_current_holder");
  }
  if (!(await rooms.isValid(roomId))) {
    // Frozen or outside the period. The tenant page distinguishes these.
    return fail("rights_not_valid");
  }

  // 3. World verification, bound to this viewing's nonce
  const verified = await verifySessionProof(body.result, body.challenge.nonce);
  if (!verified.ok) {
    return fail(`proof_${verified.code}`);
  }

  // 4. session bound to that holder on-chain
  const matches = await bindings.sessionMatchesHolder(
    sessionKey(body.result.session_id),
    holder,
  );
  if (!matches) {
    return fail("session_not_holder");
  }

  return respond(true);
}
