# Swarm

**What is where.** Deeds and application details are encrypted with AES-256-GCM on our server,
then stored on Swarm. Arkiv holds only the status and a reference to that ciphertext. The
field is `sealedRef` on `rentmeout.property-application.v1`. The deed's own reference is
inside the encrypted details, so it does not appear on Arkiv at all.

We do not use Swarm's built-in encryption: public gateways disable it, and its references
contain the decryption key, which must not reach a public entity. Our references point only
at ciphertext.

**One entity and its reference:**

- Arkiv entity: `0x7ef9a449d548ff024d87f04e99a6f7677e6ecf622f5b75c1a3445b785e649ef0`
- Swarm reference: `a7273657b5a3c2b8de37d10fa9241ded3adddc6c69fae45ee89ab84125f8cfba`
- Read the ciphertext:
  <https://api.gateway.ethswarm.org/bytes/a7273657b5a3c2b8de37d10fa9241ded3adddc6c69fae45ee89ab84125f8cfba>

**Postage and node.** Uploads go through the public gateway, `https://api.gateway.ethswarm.org`,
using bee-js's `NULL_STAMP` placeholder, so we did not buy a batch and there is no batch ID or
buying wallet to report. `SWARM_POSTAGE_BATCH_ID` is supported for a real batch.

> **Open risk:** we found no documented guarantee of how long the gateway keeps data. For
> anything that must last, use a funded batch on a Bee node.

**Files that upload and read:**

- [`app/lib/swarm/store.ts`](../app/lib/swarm/store.ts): encryption, upload and download
- [`app/lib/chain/applications.ts`](../app/lib/chain/applications.ts): writes `sealedRef`
- [`app/app/api/properties/[applicationId]/deed/route.ts`](../app/app/api/properties/[applicationId]/deed/route.ts): reads a deed

**To run one upload and one read:**

```bash
pnpm --filter app dev
cd app && node scripts/data-layer-e2e.mjs
```

Steps 1 to 3 upload, read the ciphertext directly from Swarm to confirm the address is not in
it, then decrypt through the app and compare the deed byte for byte.

**Demo video moment:** TODO, add the timestamp once the video is recorded.

**What got in the way:** see [friction.md](friction.md#swarm).
