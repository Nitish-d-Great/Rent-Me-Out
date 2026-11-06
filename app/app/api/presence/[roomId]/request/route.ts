import { NextResponse } from "next/server";
import { signRequest } from "@worldcoin/idkit-core/signing";
import {
  bindRequestToChallenge,
  serverConfig,
  verifyChallenge,
  type RpContext,
  type SignedChallenge,
} from "@/lib/world";

/**
 * Signs the broker's World ID request for one viewing.
 *
 * signRequest always picks its own nonce, so the tenant's nonce cannot be the one inside
 * the proof. This returns a binding that ties World's nonce to this challenge, and the
 * verify route requires it. A proof from an earlier viewing has a binding that names the
 * old challenge, so it fails at this one, with nothing stored server-side.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const { roomId } = await params;
  const body = (await request.json().catch(() => ({}))) as { challenge?: SignedChallenge };
  if (!body.challenge) {
    return NextResponse.json({ error: "malformed_request" }, { status: 400 });
  }

  const { challengeSecret, signingKeyHex, rpId } = serverConfig();
  const check = verifyChallenge(challengeSecret, body.challenge, roomId);
  if (!check.ok) {
    return NextResponse.json({ error: `challenge_${check.reason}` }, { status: 400 });
  }

  const signed = signRequest({ signingKeyHex });
  const context: RpContext = {
    rp_id: rpId,
    nonce: signed.nonce,
    created_at: signed.createdAt,
    expires_at: signed.expiresAt,
    signature: signed.sig,
  };
  return NextResponse.json(
    { context, binding: bindRequestToChallenge(challengeSecret, body.challenge, signed.nonce) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
