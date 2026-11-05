import { NextResponse } from "next/server";
import { issueChallenge, serverConfig } from "@/lib/world";

/**
 * Starts a viewing check. Called by the TENANT's browser from the verify page.
 *
 * The challenge is stateless: an HMAC over roomId + nonce + expiry, so nothing is
 * stored and nothing expires server-side. Its freshness is what stops a proof captured
 * at an earlier viewing being replayed at this one.
 *
 * No authentication: a tenant has no account by design, and starting a challenge
 * discloses nothing. The challenge is worthless without a valid session proof against
 * that exact nonce.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const { roomId } = await params;

  if (!roomId || roomId.length > 128) {
    return NextResponse.json({ error: "invalid_room" }, { status: 400 });
  }

  const { challengeSecret } = serverConfig();
  const challenge = issueChallenge(challengeSecret, roomId);

  // The broker's IDKit request must carry this nonce, so it is returned in the clear.
  // It is unforgeable without the secret and useless on its own.
  return NextResponse.json(challenge, {
    headers: { "Cache-Control": "no-store" },
  });
}
