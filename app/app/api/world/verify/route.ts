import { NextResponse } from "next/server";
import { isAddress } from "viem";
import {
  AlreadyBound,
  WORLD_ACTIONS,
  identityKey,
  sessionKey,
  serverConfig,
  verifyUniqueness,
  brokerAllowlist,
  brokerIdentityRegistry,
  type UniquenessResult,
} from "@/lib/world";

const bindings = brokerIdentityRegistry;
const allowlist = brokerAllowlist;

/**
 * Enrollment for both `owner-verify` and `broker-verify`.
 *
 * A successful World response means the proof is cryptographically valid. It does NOT
 * mean the identity is new -- rejecting an already-seen nullifier is our job, and here
 * it is enforced on-chain by `IdentityBinding`, not in a private table.
 *
 * Owners are allowlisted as well as brokers: under the mint-at-listing model the owner
 * holds a compliance-restricted room token between listing and sale.
 */
export async function POST(request: Request) {
  const body = (await request.json()) as {
    action?: string;
    wallet?: string;
    result?: UniquenessResult;
  };

  const { action, wallet, result } = body;

  const known = Object.values(WORLD_ACTIONS) as string[];
  // Accept a rehearsal suffix outside production (see ACTION_SUFFIX in config.ts).
  const accepted =
    action !== undefined &&
    (known.includes(action) ||
      (process.env.NODE_ENV !== "production" &&
        known.some((k) => action.startsWith(`${k}-`))));
  if (!accepted) {
    return NextResponse.json({ error: "unknown_action" }, { status: 400 });
  }
  if (!wallet || !isAddress(wallet)) {
    return NextResponse.json({ error: "invalid_wallet" }, { status: 400 });
  }
  if (!result?.responses?.length) {
    return NextResponse.json({ error: "missing_proof" }, { status: 400 });
  }

  const verified = await verifyUniqueness(result, action);
  if (!verified.ok) {
    // Deliberately coarse: never echo World's internal detail to the client.
    return NextResponse.json({ error: "verification_failed" }, { status: 401 });
  }

  const nullifier = result.responses[0].nullifier;
  if (!nullifier) {
    return NextResponse.json({ error: "missing_nullifier" }, { status: 400 });
  }

  const idKey = identityKey(action, nullifier);

  // Uniqueness. A second wallet for the same human is the ban-evasion path.
  const existing = await bindings.walletOfIdentity(idKey);
  if (existing && existing.toLowerCase() !== wallet.toLowerCase()) {
    return NextResponse.json(
      { error: "identity_already_linked" },
      { status: 409 },
    );
  }

  if (!existing) {
    try {
      await bindings.bindIdentity(idKey, wallet as `0x${string}`);
    } catch (error) {
      // The wallet already carries a different identity. That is the duplicate case
      // seen from the other side, and it must not be reported as success.
      if (error instanceof AlreadyBound) {
        return NextResponse.json(
          { error: error.kind === "wallet" ? "wallet_already_bound" : "identity_already_linked" },
          { status: 409 },
        );
      }
      throw error;
    }
  }

  // Brokers enroll with `session_id: "create"`, so the same request mints the session
  // used for every later viewing. Bind its hash to the wallet -- but only if the
  // deployed contract knows how. Enrollment is the part that qualifies; presence is the
  // part that needs session functions, so a registry without them should still let a
  // broker enroll rather than failing the whole flow.
  let sessionBound = false;
  if (result.session_id && (await bindings.supportsSessions())) {
    await bindings.bindSession(sessionKey(result.session_id), wallet as `0x${string}`);
    sessionBound = true;
  }

  if (!(await allowlist.isAllowed(wallet as `0x${string}`))) {
    await allowlist.add(wallet as `0x${string}`);
  }

  const { environment } = serverConfig();
  return NextResponse.json(
    { ok: true, action, sessionBound, environment },
    { headers: { "Cache-Control": "no-store" } },
  );
}
