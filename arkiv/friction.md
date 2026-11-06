# Friction

Observed while integrating `@arkiv-network/sdk` 1.0.1 and `@ethersphere/bee-js` 13.2.0.

## Arkiv

**Filters built at runtime fight the types.** Our filters depend on the request, so we push
conditions into an array. The array's type is inferred from its first element, then `where()`
rejects the result.
- Expected: a documented type for "some condition on this schema".
- Happened: `TS2345`, and we cast with `as never` in `listings.ts` and `applications.ts`.
- To reproduce: `const c = [eq("a", x)]; c.push(eq("b", y)); q.where(and(...c))`.
- Better: export a `Condition<Schema>` type, or show this pattern in the filter docs.

**Selected columns come back wrapped.** They arrive as `{ type, value }`, with bytes as hex, so
each app writes its own unwrap helper. A helper in the SDK would remove that.

**No sponsored writes.** Users would have to own tGLM to own their entities, so our backend
owns everything, and users cannot edit their own records. A way to pay for another wallet's
writes, or transfer on create, would make user ownership practical.

**Lifetimes cap at about 182.5 days.** A 12-month rental cannot express its true expiry, which
is the case where expiry would help most. We cap at 180 days, so longer rentals need extending.

**Entity links.** The explorer returned HTTP 200 for every entity path we tried, so we could not
tell which URL format is right, and we show keys as text. A documented deep link would help.

## Swarm

**Docs disagree across versions.** The Swarm upload page shows flat calls such as
`bee.uploadFile`, while bee-js 13 uses `bee.data.upload`. Copying from the Swarm docs fails.

**Gateway behaviour is undocumented.** We could not find what `NULL_STAMP` means, whether
`api.gateway.ethswarm.org` accepts it, its limits, or how long data persists. We only learned
it works by trying it, and retention is still unknown.

**Encryption needs its own node.** Public gateways disable encryption, and the references it
produces contain the key. We encrypt on our server instead, which took a design change.
