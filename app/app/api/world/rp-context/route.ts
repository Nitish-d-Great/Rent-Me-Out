import { NextResponse } from "next/server";
import { signRequest } from "@worldcoin/idkit-core/signing";
import { WORLD_ACTIONS, serverConfig, type WorldAction } from "@/lib/world";

/**
 * Issues an RP signature for an IDKit request.
 *
 * The World docs are explicit: "Never generate RP signatures on the client." The
 * signing key stays server-side, and a fresh signature is minted per request
 * (default TTL 300s) for both session creation and each subsequent check.
 *
 * Omit `action` for a session-only request (`proveSession`) -- the signature then binds
 * the nonce and time window only.
 */
export async function POST(request: Request) {
  let action: string | undefined;
  try {
    ({ action } = (await request.json()) as { action?: string });
  } catch {
    // no body is valid: that's a session-only request
  }

  if (action !== undefined) {
    const known = Object.values(WORLD_ACTIONS) as string[];
    if (!known.includes(action)) {
      return NextResponse.json({ error: "unknown_action" }, { status: 400 });
    }
  }

  const { signingKeyHex } = serverConfig();
  const signed = await signRequest(
    action
      ? { signingKeyHex, action: action as WorldAction }
      : { signingKeyHex },
  );

  return NextResponse.json(
    {
      sig: signed.sig,
      nonce: signed.nonce,
      created_at: signed.createdAt,
      expires_at: signed.expiresAt,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
