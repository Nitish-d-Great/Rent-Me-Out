# RentMeOut — Product Specification

## 1. Product summary

**RentMeOut** is a trust and rights-verification marketplace for room rentals. A property owner submits proof that they control a property and offers the right to rent individual rooms for a defined period. After registrar review, the owner lists rooms. A verified broker pays the owner once for a room’s rental rights for that period, then finds a tenant and manages the rental off-platform. A tenant can independently check who currently holds the room’s rental rights and whether the broker standing in front of them is that verified person.

The core promise is: **one verified broker per room and rental period, verifiable by anyone.** The product is designed to reduce fake listings, duplicate broker claims, and advance-payment fraud. It does not transfer property ownership, guarantee title, or replace a lease, local registration, or legal due diligence.

### Product model

- **Rights model:** A time-limited master-lease right to rent out one named room. It is represented by one non-fractional ERC-3643 token per room and rental period (supply 1, zero decimals).
- **Payment model:** The broker makes one upfront payment to the owner, in USDC for the demo. The broker and tenant arrange rent, deposit, lease terms, maintenance, and payment directly, outside RentMeOut.
- **Trust model:** A platform-operated registrar reviews the owner’s property evidence. World ID supports personhood and uniqueness checks. A public verification page combines Arkiv’s searchable records with a live check against the token holder on Hedera.
- **Expiry model:** Rights are valid only for the stated start and end dates. At expiry, the right becomes invalid and the token is burned; the public listing and verification record expire as well.

## 2. Users and permissions

| User | What they need | Can do | Verification |
|---|---|---|---|
| **Owner** | Prove control of a property, offer room rights, receive payment | Submit a property and deed, respond to a rejection, list available rooms and periods, set a one-time price per room, cancel unsold rooms before the period | World ID personhood/uniqueness check and registrar deed review |
| **Registrar** | Prevent unsupported properties and handle disputes | Review deed submissions, approve or reject with a reason, register approved properties, verify brokers for token eligibility, freeze a token during a dispute, burn unsold tokens after cancellation | Platform-operated role with restricted issuer/agent permissions |
| **Broker** | Buy legitimate room rights and prove them to prospective tenants | Verify identity, browse available rooms, pay the owner, hold the room token, show the verification page at a viewing | World ID check; approved wallet on the ERC-3643 compliance list |
| **Tenant** | Check that a broker is authorised for a specific room and period | Browse public room and rights information, scan a QR code, run a live broker presence check | No account required for public verification; the broker completes the live check |
| **Platform backend** | Connect partner services and keep records in sync | Validate partner proofs, write public index records, upload and decrypt deed documents for authorised review, send platform transactions, track token lifecycle events | Server-side secrets and operational controls; never acts as owner or broker |

The registrar is the only platform-run user role. Owners, brokers, and tenants use the same web app with role-specific navigation and actions.

## 3. Product experience and information architecture

### Public website

**Home / How it works**

- Explain the “one verified broker per room and period” promise in plain language.
- Primary actions: **Browse rooms**, **List a property**, **Verify a broker**.
- Show the three trust steps: property review, broker verification, public rights check.
- State clearly that RentMeOut verifies a recorded rental-right token and identity match; it does not guarantee title, safety, or the legal sufficiency of a rental agreement.

**Marketplace**

- Search/filter by city, dates, room count, and price.
- Listing card: property nickname or locality (avoid publishing a full private address), room name, available period, one-time rights price, status, verified-property badge, and **View room**.
- Only show rooms whose listing is available, whose start date has not passed, and whose end date is in the future.
- Never show deed files, private owner data, or sensitive location details publicly.

**Room details**

- Property summary, room description/photos, rental-right period, one-time price, token status, and property review status.
- Explain the broker’s role: this payment buys the time-limited right to rent the room; the tenant’s rent and lease are arranged separately with the broker.
- Show a public verification link/QR and the latest rights status.
- For eligible verified brokers, show **Buy room rights**; otherwise explain how to verify first.

**Verify a room / QR landing page**

- Accessible without an account through a shareable URL and QR code.
- Show property/room identifier, rights status (available, held, frozen, expired), holder’s public wallet alias/address, valid-from and valid-until dates, and transaction/reference links where available.
- Confirm current holder against Hedera; use Arkiv for discovery and supporting index data.
- Show **Verify this broker in person** to start a short-lived viewing session. The broker completes a fresh World ID presence check. Display a prominent green match or red mismatch, with the result time and session state. Never reveal the broker’s identity document or raw World ID data.

### Owner workspace

**Owner dashboard**

- Property cards grouped by **Needs review**, **Approved**, **Rejected**, and **Archived**.
- Clear next action and status timeline for each property.
- Short explanation when a property is rejected and a path to resubmit corrected evidence.

**Submit property**

1. Connect a Hedera-compatible wallet.
2. Complete the World ID owner verification action.
3. Enter property nickname, city/locality, address for registrar review, number of rooms, and basic property details; upload room photos and a deed PDF.
4. Review a privacy notice explaining that the deed is encrypted, privately stored, and visible only to the registrar through the review workflow.
5. Submit. Show a receipt and **Pending registrar review** status.

**Create a room listing**

1. Choose an approved property and one or more rooms.
2. Set a start date, end date, one-time USDC price per room, room name, and short description.
3. Preview the public listing and what a broker receives.
4. Confirm the transaction and wallet prompts.
5. Show per-room issuance/listing progress and links to the public listing and verification QR.

Owners can cancel a room listing only before it sells. The registrar burns the unsold room token and the listing is removed. Sold rights cannot be cancelled through the MVP.

### Broker workspace

**Broker onboarding**

1. Connect wallet.
2. Complete the World ID broker verification action.
3. Backend validates the proof and checks that the same person is not already bound to a different wallet.
4. Registrar-authorised backend adds the wallet to the ERC-3643 verified/KYC list.
5. Show **Verified broker** status and explain that the account is eligible to purchase room rights.

If World ID is cancelled or invalid, keep the account unverified and explain how to retry. If the identity is already linked to another wallet, block the second wallet and show a clear support path.

**Browse and purchase**

1. Browse available room listings and filter by dates/location.
2. Review the room, period, price, owner/property verification status, and purchase terms.
3. Associate USDC with the account if needed; show a one-click help state for insufficient balance or missing token association.
4. Approve and confirm purchase.
5. On success, show the transaction reference, rights period, room token, owner payment confirmation, and a shareable verification QR/link.

Purchase should be atomic where the ATS permissions permit: USDC transfers to the owner and the room token moves to the broker in the same transaction. If that is unavailable, use the disclosed backend-agent fallback and show a **Payment received — token transfer pending** state until the transfer is confirmed. Do not present a completed purchase before both conditions are confirmed.

There are no refunds for an early exit and no broker-to-broker resale in the MVP. The broker handles tenant placement and ongoing rental arrangements off-platform.

### Registrar console

**Review queue**

- Pending applications sourced from Arkiv.
- Property details and deed preview fetched through an authorised, audited backend endpoint; never expose the deed URL or decryption key in the browser.
- Actions: **Approve property** or **Reject with reason**. Approval registers the property on Hedera and updates the application status. Rejection records the reason and creates no room tokens.

**Broker and dispute controls**

- View broker verification status and wallet eligibility.
- Search by property, room, token, or application identifier.
- Freeze a room token during a dispute, with a required reason and audit record; unfreeze after resolution.
- Burn unsold room tokens when an owner cancels before sale.
- Show transaction status and retry/reconciliation states without silently marking failed actions complete.

Registrar actions must be permissioned and recorded with actor, timestamp, target, reason, and transaction reference.

## 4. End-to-end user journeys

### A. Owner onboards and submits a property

`Connect wallet → World ID owner check → property details + deed upload → encrypted private storage → pending application → registrar review`

- Backend validates the World ID proof and binds the resulting uniqueness/nullifier reference to the wallet. If already bound elsewhere, block submission.
- Backend encrypts the deed before upload to Swarm. Arkiv stores the application status and non-sensitive metadata; no cleartext deed or public storage reference is exposed in the public record.
- Owner sees a pending receipt and can return later to check progress.

### B. Registrar approves or rejects

`Open pending application → inspect deed securely → approve or reject → owner sees outcome`

- Approval writes the property to the Hedera registry and changes the Arkiv application to approved.
- Rejection records a human-readable reason in Arkiv, leaves the property unapproved, and issues no tokens.
- Listing creation is blocked at the contract level for unapproved properties, even if the UI is bypassed.

### C. Owner lists rooms

`Select approved property and rooms → set period and price per room → review → confirm → issue one token per room → publish room records`

- The registry rejects invalid dates and overlapping active periods for the same room.
- Each token has supply 1, zero decimals, a unique room/period label, and start/end dates.
- Each room receives a separate Arkiv `RoomListing` record with an expiry corresponding to the listed period.
- The listing becomes visible only after the required on-chain issuance and index writes are confirmed.

### D. Broker verifies and buys a room

`Connect wallet → World ID broker check → approved-wallet list → browse → select room → pay USDC → receive token`

- Unverified wallets cannot receive room tokens; both UI and token compliance controls block them.
- Purchase checks availability and current token ownership before settling.
- USDC payment goes to the owner. The broker becomes the rights holder for the listed period.
- Arkiv is updated to sold/held and a `RightsRecord` supports public lookup. Hedera remains the source of truth for token ownership and lifecycle.

### E. Tenant verifies at a viewing

`Scan QR → review room and rights period → start live check → broker completes fresh World ID check → compare with current token holder → show match or mismatch`

- The public page reads the room record from Arkiv and confirms the holder/status against Hedera.
- A green result means the person present completed the fresh check and matches the currently verified token-holder identity. A red result means the match failed; the tenant should not rely on that broker’s claim.
- A frozen token is clearly marked **Frozen — under review**. An expired or burned token shows that there is no current valid holder.

### F. Dispute, cancellation, and expiry

- **Dispute:** Registrar freezes the token; marketplace and verification page show frozen status until resolution.
- **Owner cancellation before sale:** Registrar burns unsold token(s), closes those listings, and records the action.
- **Expiry:** `isValid()` becomes false at the end date. A Hedera Scheduled Transaction burns the token when supported; a keeper job is the fallback for longer scheduling windows. Arkiv listing and verification entities expire as well.
- Owners may create a new listing for a subsequent, non-overlapping period.

## 5. Key screens and visible states

| Screen | Main content | Important states |
|---|---|---|
| Home | Promise, how it works, entry points | Connected/disconnected wallet |
| Marketplace | Search, filters, room cards | Loading, no results, sold, expired, unavailable |
| Room details | Room, period, one-time price, rights explanation | Available, purchase pending, sold, frozen, expired |
| Owner dashboard | Property cards and status timeline | Draft, pending review, approved, rejected, listing active |
| Property submission | Identity check, property form, deed upload | Proof required, duplicate identity, uploading, submitted, failure |
| Listing builder | Room selection, date range, price, preview | Overlap rejected, unapproved property, wallet confirmation, issuance pending |
| Broker dashboard | Verification and owned rights | Unverified, verified, purchase pending, held, expired |
| Registrar queue | Application review and deed preview | Pending, approved, rejected, transaction pending/failed |
| Public verify page | Rights holder, room, period, status, proof links | Match, mismatch, frozen, expired, chain/index syncing |
| Viewing check | Session code/QR, World ID action, result | Waiting, verifying, green match, red mismatch, expired session |

For any action that crosses an external service or chain, show a pending state, a confirmed state, and a recoverable error state. Display human-readable errors and the relevant transaction/reference ID. Never show a success state based solely on a submitted transaction.

## 6. Partner integrations and source of truth

| Partner | Product role | Data written/read | UX impact |
|---|---|---|---|
| **Hedera + Asset Tokenization Studio (ATS)** | Canonical rights and settlement layer | ERC-3643 room tokens, verified-holder compliance list, USDC purchase settlement, freeze/burn lifecycle actions, property/listing registry | Wallet transactions, ownership and status confirmation, transaction links, scheduled expiry |
| **World ID / IDKit** | Personhood and uniqueness verification | Proof validation and nullifier-to-wallet binding; two actions (owner verification and broker verification), plus a session proof for repeated broker presence checks at viewings | Identity check during onboarding and fresh session proof at a viewing; no raw identity details displayed |
| **Arkiv** | Searchable application, listing, and verification index | Property applications, room listings, rights records, public marketplace and registrar queue queries, expiry metadata | Fast searchable listings and public verification data; chain reads confirm authoritative rights status |
| **Swarm** | Private deed document storage | Encrypted deed upload and authorised retrieval through backend | Owner upload and registrar-only review; deed content is never publicly queryable |

### Data and trust boundaries

- **Hedera is authoritative** for token holder, token validity, transfer, freeze, burn, and settlement state.
- **Arkiv is an index**, not proof of current ownership. The UI must confirm rights against Hedera before showing a holder as current.
- **World ID proves a personhood/uniqueness check**, not property ownership, broker competence, or legal authority by itself.
- **Swarm stores encrypted documents.** Encryption keys and decrypt operations stay server-side and are limited to registrar review.
- Public records contain only the minimum room/property metadata needed for discovery and verification. Do not publish full deed content, owner personal data, precise address, or raw identity proofs.

## 7. MVP scope for the ETHGlobal demo

### Must work end to end

1. Owner connects wallet, completes a World ID simulator check, submits a sample deed and property application.
2. Backend encrypts/uploads the deed to Swarm; Arkiv stores a pending application without a cleartext deed reference.
3. Registrar opens the queue and approves the property on Hedera or rejects it with a reason.
4. Owner lists multiple rooms for one period and price per room; a token and Arkiv listing are created per room.
5. Broker verifies with World ID and is added to the ATS verified list.
6. Broker browses and buys one room using test USDC; owner receives payment and broker receives the token.
7. Tenant scans a QR and sees the current holder, period, and validity confirmed against Hedera.
8. Tenant runs one live broker presence check (session proof) that produces a clear match or mismatch result.
9. Registrar freezes a token in a dispute, and the public verification screen reflects the frozen state.
10. At least one failure path is demonstrated: an unverified broker’s purchase is blocked. Duplicate identity and overlapping listing failures are also handled in the product.

### Stretch goals

- Scheduled token burn at expiry with a keeper fallback.
- QR code per room/listing and a clean tenant-facing mobile layout.
- Atomic `buyRoom()` payment and transfer; if ATS permissions prevent it, backend transfer after confirmed payment.
- Optional platform fee, broker resale with owner royalty, on-chain broker profile, tenant-facing chat bot.

### Explicit MVP exclusions

- Property title transfer or fractional ownership.
- Tenant rent collection, deposits, lease drafting, eviction, maintenance, or dispute adjudication.
- Refunds for early broker exit or broker-to-broker resale.
- Publicly exposing deed documents or owner identity data.
- Treating testnet identity checks or a registrar review as a legal title guarantee.

## 8. Product rules and failure handling

| Condition | Enforcement | User-facing result |
|---|---|---|
| Owner skips/cancels identity check | No validated proof; submission disabled | “Verify your identity to submit this property.” |
| Same person tries another wallet | Backend uniqueness/nullifier binding | “This identity is already linked to another wallet.” |
| Registrar rejects deed | Registrar status + Arkiv application state | Rejected status with reason; no listing action |
| Property is not approved | Hedera registry validation | Listing action blocked with approval guidance |
| Room period overlaps an active listing | `RentalRegistry.createListing()` | “This room is already listed for part of these dates.” |
| Broker is unverified | ATS verified-holder list | Buy button disabled with verification action |
| Missing USDC association or insufficient funds | Hedera token/account checks | Explain issue and show association/funding help |
| Room sold or purchase races another buyer | Contract availability/holder check | Refresh state; show sold and do not claim purchase succeeded |
| Payment confirms but token transfer is pending (fallback path) | Backend reconciliation worker | “Payment received — rights transfer pending”; show transaction reference |
| Broker presence does not match holder | Fresh World ID proof compared server-side | Red mismatch; advise tenant not to proceed on that claim |
| Dispute is active | Registrar freeze action | “Frozen — under review” on marketplace and verification page |
| Chain/index is temporarily out of sync | Event listener + confirmation/reconciliation | “Updating rights status”; do not show stale index data as confirmed |
| Expiry has passed | Contract validity check and expiry worker | “Expired — no current valid holder”; remove from available marketplace |

## 9. Product requirements and acceptance criteria

- A property cannot be listed until it has an approved registrar status on-chain.
- A room cannot have two active rights listings whose periods overlap.
- Every room-period right has a unique token with supply 1 and zero decimals.
- Only a verified broker wallet can receive a room token.
- A purchase cannot be marked complete until payment and token ownership are both confirmed.
- Public verification works without a user account and confirms current status against Hedera.
- The presence check is fresh for the current viewing session and compares the person present with the current token holder.
- Frozen, expired, sold, and syncing states are visually distinct and understandable.
- Deeds are encrypted before storage; only registrar-authorised backend access can decrypt them.
- Registrar approvals, rejections, freezes, unfreezes, and burns produce an audit record.
- All partner calls and chain writes show pending, success, and error outcomes with useful references.
- The product explains that room rights and tenant rental contracts are separate, and avoids presenting the token as property title.

## 10. Suggested navigation

**Public:** Home · Browse rooms · Verify a room · Connect wallet

**Owner:** Dashboard · My properties · Create listing · Transaction history

**Broker:** Marketplace · My room rights · Verification status · Transaction history

**Registrar:** Review queue · Properties · Brokers · Disputes · Audit log

The public verification route should remain directly accessible from a QR code, even when the visitor has no wallet or account.

## 11. Demo narrative

1. Show the problem: two brokers claim the same flat and both ask tenants for advances.
2. Owner verifies, uploads a sample deed, and submits a property.
3. Registrar reviews and approves it.
4. Owner offers three rooms for a fixed period; show three one-of-one room tokens.
5. Verified Broker A buys Room 2 with test USDC.
6. Unverified Broker B attempts to buy Room 3 and is blocked.
7. Tenant scans the Room 2 QR, sees Broker A and the valid-through date, then runs the live check and sees a green match.
8. Registrar freezes Room 2 to demonstrate dispute handling; the tenant page immediately communicates the changed status.
9. Close with the core promise: one verified broker per room and period, verifiable by anyone.

## 12. Important implementation assumptions to validate

- ATS supports the needed ERC-3643 roles, transfer restrictions, freeze/burn operations, and the token metadata needed for per-room periods.
- Whether a custom registry contract can operate as an ATS agent for atomic payment and token transfer; otherwise use the disclosed backend-agent transfer path.
- Hedera Scheduled Transaction limits; use a keeper job for periods beyond its supported scheduling window.
- Whether the World ID Simulator supports session proofs (`createSession` / `proveSession`). The whole presence flow depends on it, so test early. Also unresolved: whether a session proof is cryptographically bound to the credential holder who created the session — the docs do not say, so the presence claim currently rests on the broker holding their own session ID.
- Arkiv entity expiry precision and maximum duration; filter by end date if expiry cannot be aligned exactly.
- Swarm postage/Bee availability and the operational model for deed key custody and registrar-only retrieval.

These are integration assumptions from the hackathon proposal, not confirmed partner guarantees. The demo should label testnet, simulator, and sample-deed behavior clearly.

## 13. Privacy-preserving property verification

The product should let a broker or tenant verify that a room is backed by a registrar-approved property without publishing the property's real address or deed to the chain or public index. Use a randomized, hiding property commitment and a zero-knowledge proof of membership in the registrar's current approved-property set. Bind the proof to the opaque room commitment, room period, current Hedera root/version, and a short-lived verification challenge. The verification page checks the proof locally, then independently reads the token holder and lifecycle status from Hedera.

The tenant-facing result should say **“This room is backed by a registrar-approved property”** and **“Rights valid through [date]”**. It should not expose the address, deed, salt, or private identity data. If the tenant must know where the room is, the real location can be disclosed privately for that viewing after verification; public proof does not make a hidden location useful for attending a viewing.

This proves that a registrar-approved attestation exists and is linked to the room rights. The registrar's evidence review remains the source of the real-world claim; a ZK proof alone cannot prove that a deed is genuine or that a QR code is physically attached to the described property. Keep **property approved** and **broker matches the current rights holder** as separate checks. See [architecture.md](./architecture.md) for diagrams, proof inputs, storage boundaries, threat model, and implementation sequence.

