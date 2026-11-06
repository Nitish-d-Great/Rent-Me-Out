/**
 * End-to-end World ID verification against World ID 4.0 staging.
 *
 * Signs a request with the RP signing key, has the World ID Simulator complete it with a
 * real Proof of Human, then verifies the proof against the Developer Portal. No phone,
 * no Orb, no browser -- IDKit runs in Node, so this is repeatable rather than a manual
 * click-through.
 *
 *   node scripts/verify-e2e.mjs                 # fresh action each run
 *   node scripts/verify-e2e.mjs my-fixed-action # reuse an action to exercise the
 *                                               # duplicate-identity path
 *
 * Run it twice with the same action and the second run returns the SAME nullifier with
 * success: true and "(nullifier reuse)" in the message. World does not block duplicates.
 * One human holding one wallet is enforced by IdentityBinding.sol, not by World.
 */
import { readFileSync } from "node:fs";
import crypto from "node:crypto";
import { IDKit, proofOfHuman } from "@worldcoin/idkit-core";
import { signRequest } from "@worldcoin/idkit-core/signing";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

const { WORLD_APP_ID: APP, WORLD_RP_ID: RP, WORLD_SIGNING_KEY_HEX: KEY } = env;
if (!APP || !RP || !KEY) {
  console.error("Missing WORLD_APP_ID / WORLD_RP_ID / WORLD_SIGNING_KEY_HEX in .env.local");
  process.exit(1);
}

const action = process.argv[2] || `e2e-${crypto.randomUUID()}`;
console.log(`action: ${action}\nrp:     ${RP}\n`);

const sig = await signRequest({ signingKeyHex: KEY, action, ttl: 600 });
console.log(`1. signed request            ttl ${sig.expiresAt - sig.createdAt}s`);

const request = await IDKit.request({
  app_id: APP,
  action,
  environment: "staging",
  allow_legacy_proofs: false, // required when minting a session
  session_id: "create",
  rp_context: {
    rp_id: RP,
    nonce: sig.nonce,
    created_at: sig.createdAt,
    expires_at: sig.expiresAt,
    signature: sig.sig,
  },
}).preset(proofOfHuman());

// NEVER log connectorURI: it carries the bridge encryption key.
const res = await fetch("https://simulator.worldcoin.org/api/mcp", {
  method: "POST",
  headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name: "complete_test_request", arguments: { connect_url: request.connectorURI } },
  }),
});
const body = await res.text();
const rpc = JSON.parse(
  body.split("\n").filter((l) => l.startsWith("{") || l.startsWith("data: {")).pop().replace(/^data: /, ""),
);
console.log(`2. simulator                 ${rpc.result?.content?.[0]?.text ?? JSON.stringify(rpc)}`);

const completion = await request.pollUntilCompletion({ timeout: 120000 });
if (!completion.success) {
  console.error(`3. FAILED                    ${completion.error}`);
  process.exit(1);
}
const r = completion.result;
console.log(
  `3. proof received            protocol ${r.protocol_version} | env ${r.environment} | ` +
  `credential ${r.responses?.map((x) => x.identifier).join(",")} | session ${r.session_id ? "created" : "none"}`,
);

// proof_delivered is delivery, not acceptance. Our backend's answer is the real verdict.
const verify = await fetch(`https://developer.world.org/api/v4/verify/${RP}`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ ...r, min_protocol_version: "4.0" }),
});
const v = await verify.json();
console.log(`4. portal verify             HTTP ${verify.status} | success ${v.success}`);
console.log(`   nullifier                 ${v.nullifier}`);
console.log(`   message                   ${v.message}`);
process.exit(v.success === true ? 0 : 1);
