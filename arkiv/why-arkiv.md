# Why Arkiv

Arkiv is the public index a tenant can query without an account. A room can be found by
city, availability and price, and the listing record has its own end time. That gives
another client the same way to discover the listing without asking our server to
translate a private database query. A Postgres-backed app could expose a public API too;
what it would not give us by default is a shared, wallet-owned entity with a network
expiry that readers can query directly.

Arkiv is not the authority for room rights. Hedera is. A purchase or freeze is settled
there first, then copied into Arkiv for discovery. If that copy fails, the right is still
real and the app reports the index as unavailable; it never treats a stale Arkiv record
as proof of ownership.

We keep the following data elsewhere:

| Data | Where it lives | Why |
|---|---|---|
| City, price, dates and public listing status | Arkiv | These are fields tenants filter on and can safely be public. |
| Current holder, transfer and payment | Hedera | This is the source of truth for who holds the rental right. |
| Deed, address, nicknames and property details | Encrypted on Swarm | Arkiv entities are public; these details should not be. |
| Encryption key | Server environment | A key in a public entity would make the ciphertext readable. |
| World ID nullifier hash | Hedera | It is used to prevent the same identity registering twice; letting it expire could reset that check. |
| Owner's Semaphore secret | Owner's browser | The secret used to make a proof should not leave the owner's device. |

Today one backend wallet writes the Arkiv records and pays their tGLM fees. The `payout`
field on a room listing is the property owner's wallet, but the Arkiv entity owner is our
backend wallet. That keeps the demo usable without asking every owner for tGLM; it also
means the owner cannot edit their Arkiv entity directly. Sponsored writes or a practical
way to transfer ownership at creation would make this design better.
