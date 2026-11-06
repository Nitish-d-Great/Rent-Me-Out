# Arkiv schema

All entities are on Rabdi (chain ID 7794095). They are written by one backend wallet,
`0xE47DBA74b5F91f216D9456d1d6698b6907c391dF`, which pays in tGLM. Anyone can write under a
schema name, so every read filters on that owner. Every entity also carries `registry`, the
Hedera contract it belongs to, so a new deployment starts empty instead of inheriting
approvals that mean nothing there.

Definitions: [`app/lib/arkiv/schemas.ts`](../app/lib/arkiv/schemas.ts)

## `rentmeout.property-application.v1`

The registrar's review queue. Expires 90 days after submission.

| Field | Type | Queried | Purpose |
|---|---|---|---|
| `registry` | addr | yes | Scopes the queue to one deployment |
| `applicationId` | str | yes | Opaque reference |
| `status` | str | yes | `pending`, `approved` or `rejected` |
| `ownerTag` | str | yes | Hash of the owner's commitment, so their device finds its applications |
| `submittedAt` | u64 | yes | Unix seconds |
| `sealedRef` | str | no | Swarm reference to the encrypted details |
| `decidedAt` | u64 | no | Set on decision |
| `decisionTx` | str | no | The Hedera transaction that made the decision |
| `reason` | bytes | no | Rejection reason |

## `rentmeout.room-listing.v1`

A searchable room. Expires when its rental period ends, or after 180 days if the period is
longer, because Arkiv caps lifetimes at about 182.5 days.

| Field | Type | Queried | Purpose |
|---|---|---|---|
| `registry` | addr | yes | Scopes listings to one deployment |
| `listingId` | u64 | yes | The Hedera listing ID |
| `status` | str | yes | `available`, `sold`, `frozen` or `cancelled`, copied from Hedera |
| `city` | str | yes | The marketplace's city filter |
| `priceUsdc` | u64 | yes | Six decimals |
| `startsAt`, `endsAt` | u64 | yes | Rental period in unix seconds |
| `payout` | addr | yes | The owner's wallet |
| `token` | addr | no | The room's ATS token |
| `label`, `listingTx` | str | no | Display name and the Hedera transaction |

## `rentmeout.rights-record.v1`

Public record of a sale. Expires with the rights.

| Field | Type | Queried | Purpose |
|---|---|---|---|
| `registry` | addr | yes | Scopes records to one deployment |
| `listingId` | u64 | yes | The room |
| `holder` | addr | yes | The broker's wallet |
| `validUntil` | u64 | yes | End of the rights |
| `validFrom` | u64 | no | Start of the rights |
| `token` | addr | no | The room's ATS token |
| `purchaseTx` | str | no | The Hedera purchase |

## A query you can run

No access key is needed. It returns available rooms in Pune.

```ts
import { createPublicClient } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { and, eq } from "@arkiv-network/sdk/query";
import { addr, defineSchema, str, u64 } from "@arkiv-network/sdk/schema";
import { http } from "viem";

const RoomListing = defineSchema("rentmeout.room-listing.v1", {
  registry: addr().indexed(), listingId: u64().indexed(), status: str().indexed(),
  city: str().indexed(), priceUsdc: u64().indexed(), startsAt: u64().indexed(),
  endsAt: u64().indexed(), payout: addr().indexed(),
  token: addr(), label: str(), listingTx: str(),
});

const client = createPublicClient({ chain: rabdi({ accessKey: "" }), transport: http() });
const { entities } = await client
  .select({ $key: true, listingId: true, city: true, status: true, token: true })
  .from(RoomListing)
  .ownedBy("0xE47DBA74b5F91f216D9456d1d6698b6907c391dF")
  .where(and(eq("city", "Pune"), eq("status", "available")))
  .fetch();
console.log(entities);
```
