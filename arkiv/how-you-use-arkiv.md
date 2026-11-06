# How we use Arkiv

**Filters match what users do.** Each indexed field exists because a screen filters on it:

| What the user sees | Arkiv query | Code |
|---|---|---|
| City chips on the marketplace | `RoomListing` by `city` | [`marketplace/page.tsx`](../app/app/(marketing)/marketplace/page.tsx) |
| Registrar's review queue | `PropertyApplication` by `registry` | [`applications.ts`](../app/lib/chain/applications.ts) |
| An owner's "My properties" | `PropertyApplication` by `ownerTag` | [`use-owner.ts`](../app/lib/chain/use-owner.ts) |
| A room's status in search | `RoomListing` by `status` | [`listings.ts`](../app/lib/arkiv/listings.ts) |
| Purchase link on the verify page | `RightsRecord` by `registry` | [`listings.ts`](../app/lib/arkiv/listings.ts) |

**Who can edit.** The backend wallet owns every entity, because owners and brokers should not
need tGLM to use the product. That also means users cannot edit their own records today. The
values it writes for rooms are read from Hedera at write time
([`sync.ts`](../app/lib/arkiv/sync.ts)), so anyone may trigger a sync but nobody can
influence what it writes.

**Expiry matches the product.** A room right ends on a date, so its listing and rights record
expire on that date. The marketplace needs no cleanup job, and an old listing cannot linger.
The exception is a rental longer than 180 days: its entities would expire early and need
extending, which we have not built.

**What each feature changes for users:**

- Queries: rooms can be found by city, which Hedera's contract state cannot do.
- Expiry: ended rooms stop appearing in search on their own.
- Owner filter: a third party writing under our schema name cannot inject fake rooms.
- `patchEntity`: a sale or freeze changes a room's status in search.

**Verified by:** `app/scripts/data-layer-e2e.mjs`, which runs the flow through the app's own
routes against the live network. Its last full run passed all 23 checks.
