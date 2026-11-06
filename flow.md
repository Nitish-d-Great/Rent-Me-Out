# Step-by-step flow

**Entities:** Owner · Registrar · Broker · Tenant · Backend · World ID · Hedera (RentalRegistry + ATS) · Arkiv · Swarm

> This began as a design plan, written before the contracts were built. Steps that
> diverge from what is actually deployed are marked **[built differently]** or
> **[not built]** with the real call beside them. Nothing below is removed, so the
> original intent stays readable next to what shipped.

## Owner onboarding

1. Owner → World ID: verify, action `owner-verify`
2. Backend → World API: validate proof server-side
3. Backend → DB: store nullifier → owner wallet (reject if nullifier already bound)
4. Backend → Hedera/ATS: allowlist owner wallet (registrar key)
5. Owner → Backend: property details + deed PDF
6. Backend → Swarm: encrypt + upload deed — **[not built]**
7. Backend → Arkiv: write `PropertyApplication` (status `pending`) — **[not built]** currently a file store at `app/.rmo-data/applications.json`

Also built but not in the original plan: the owner's browser creates a **Semaphore identity**
and submits only its commitment. The secret never leaves the device, which is what makes a
later listing unlinkable to the property.

## Registrar review

8. Registrar → Arkiv: query `PropertyApplication` where status = `pending` — **[built differently]** reads the local store via `GET /api/properties`
9. Registrar → Backend → Swarm: fetch + decrypt deed, check against owner details — **[not built]**
10. Registrar → Hedera: `registerProperty(propertyId, owner, deedHash)` — **[built differently]** `approveProperty(bytes32 applicationId, uint256 commitment)`; there is no `registerProperty`. Approval admits the owner's commitment to a Semaphore group, not a property record.
11. Backend → Arkiv: status → `approved` *(reject branch: → `rejected` + reason, flow stops)* — reject is real on-chain: `rejectProperty(applicationId, reasonHash)`

## Listing

12. Owner → Hedera: `createListing(propertyId, N rooms, start, end, prices[])` — **[built differently]** `createListing(proof, uint64 start, uint64 end, uint256 price, address payout)`, one call per room, authorised by a Semaphore proof rather than by property id
13. Hedera: assert property approved + no period overlap for those rooms — enforced via the proof and a single-use nullifier
14. Hedera/ATS: mint 1 token per room → **owner's wallet** — **[built differently]** the registry mints `RoomRights`, not the ATS token. `RentalRegistry.rights()` is immutable, so moving purchases onto the ATS token needs a registry redeploy.
15. Hedera: emit `ListingCreated`
16. Backend → Arkiv: write N × `RoomListing` (expire = listing end date) — **[not built]**

## Broker onboarding

17. Broker → World ID: verify, action `broker-verify` (Proof of Human)
18. Backend → World API: validate proof
19. Backend → DB: store nullifier → broker wallet (reject on duplicate)
20. Backend → Hedera/ATS: allowlist broker wallet (registrar key)

## Purchase

21. Broker → Arkiv: query rooms where status = `available`, end date > now — **[built differently]** reads the registry directly via `GET /api/rooms`
22. Broker → Hedera: `approve()` USDC spend to `RentalRegistry`
23. Broker → Hedera: `buyRoom(listingId, roomIndex)` — **[built differently]** `buyRoom(uint256 listingId)`; a listing is already one room
24. Hedera: USDC broker → owner
25. Hedera/ATS: `forcedTransfer()` room token owner → broker (registry's agent role)
26. Hedera: emit `RoomPurchased` *(plan said `RoomSold`)*
27. Backend listener → Arkiv: `RoomListing` → `sold`, write `RightsRecord` — **[not built]** state is read back from the registry instead
28. Backend → Hedera: create Scheduled Transaction to burn at end date — **[not built]**

## Tenant verification

29. Tenant → Arkiv: query verify index by propertyId (QR or ID) — **[built differently]** the verify page reads Hedera directly
30. Tenant → Hedera: `holderOf()` + `isValid()` cross-check — built as one call, `verifyRoom(listingId)`
31. Tenant → Backend: start presence session
32. Broker → World ID: verify, action `broker-presence` (fresh) — **[built differently]** a `broker-presence` action is impossible: World ID 4.0 allows one nullifier per person per action, so a repeatable check cannot be an action. Rebuilt on **session proofs** (`createSession` / `proveSession`).
33. Backend: compare nullifier against the token-holder wallet's → green / red to tenant

## Dispute

34. Registrar → Hedera: `freezeRoom(listingId, reasonHash)` → `isValid()` returns false
35. Registrar → Hedera: `unfreezeRoom(listingId, reasonHash)` on resolution

## Expiry

36. Scheduled Tx → Hedera: `burnExpired(listingId, roomIndex)` — **[built differently]** `expire(uint256)` and `expireMany(uint256[])` exist on the contract; nothing calls them automatically yet
37. Arkiv: `RoomListing` + `RightsRecord` auto-expire on the same date — **[not built]**
38. Owner → Hedera: `createListing()` for the next period — needs a fresh approval, since an approval is single-use

## Cancel branch (any time before a room sells)

39. Owner → Hedera: `cancelListing(listingId)` — burns unsold room tokens, reverts if any room already sold

---

## What this means in short

Built and verified on testnet: steps 1–5, 8, 10–15, 17–26, 29–35.
Not built: Swarm (6, 9), Arkiv (7, 16, 21, 27, 29, 37), Scheduled Transactions (28, 36).

The single biggest gap is **Arkiv**, which the original plan leans on in six places and which
`architecture.md` assigns the application and listing index. The file store standing in for it
does not survive a deploy to an ephemeral filesystem.
