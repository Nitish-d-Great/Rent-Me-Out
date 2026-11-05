import { NextResponse } from "next/server";
import { serverConfig, verifyReceipt } from "@/lib/world";

/**
 * Tenant side of the presence check. The tenant's page posts the receipt it read off the
 * broker's phone, together with the nonce it issued itself, and the server confirms the
 * signature. Nothing is stored -- the MAC is recomputed.
 *
 * A missing or unverifiable receipt is NOT a green. Absence of proof is treated as
 * unverified, which is the whole point of the screen.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const { roomId } = await params;
  const body = (await request.json()) as { receipt?: string; nonce?: string };

  if (!body.receipt || !body.nonce) {
    return NextResponse.json(
      { match: false, reason: "malformed_request" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const { challengeSecret } = serverConfig();
  const checked = verifyReceipt(challengeSecret, body.receipt, roomId, body.nonce);

  if (!checked.ok) {
    return NextResponse.json(
      { match: false, reason: `receipt_${checked.reason}` },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    {
      match: checked.receipt.match,
      reason: checked.receipt.match ? undefined : checked.receipt.reason,
      checkedAt: checked.receipt.issuedAt,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
