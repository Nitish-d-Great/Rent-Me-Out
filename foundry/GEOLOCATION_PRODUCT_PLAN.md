# Property geolocation and trust plan

## Product outcome

A renter or broker can open a room listing and compare its on-chain map pin with the property shown by the owner and registrar. A listing pin cannot be changed by the transaction relayer after the owner creates the approval proof.

## Owner and registrar flow

1. The owner adds a location during the property application. They can search OpenStreetMap, share the device's browser location, or edit latitude and longitude directly.
2. The application keeps the coordinates inside the encrypted Swarm payload. Arkiv continues to expose only the searchable listing fields; it does not hold a second copy of the coordinates.
3. The registrar sees the map beside the deed and checks that the pin matches the submitted property documents before approving the application.
4. When listing a room, the owner app takes the coordinates from that approved application. The owner's Semaphore proof binds the exact coordinates, period, price, and payout wallet.
5. `RentalRegistry` stores latitude and longitude as signed integer microdegrees (`int32`, six decimal places) in the listing record, in the same transaction that issues the ATS room token.
6. The marketplace, broker room detail, and tenant verification view read the coordinates from Hedera and render the map. A person can inspect the listing contract and coordinates without trusting Arkiv indexing.

## Source of truth

- **Hedera / `RentalRegistry`:** listing coordinates and room rights. The token address is linked by `tokenOf(listingId)`; the ATS token itself does not implement a metadata URI.
- **Swarm:** encrypted application details, including the proposed location and deed, for registrar review.
- **Arkiv:** searchable listing index and lifecycle index. Coordinates are deliberately not duplicated there.
- **OpenStreetMap:** map rendering and address search. It is a display/geocoding service, not a trust or verification authority.

## What the trust signal means

The owner-supplied coordinates are committed by the approved-member proof and become immutable once the listing is created. The registrar must compare the pin with the deed before approving the property. Browser GPS proves only what the device reported at submission time; it can be spoofed and does not prove title, occupancy, or that the building exists. The UI must call these “registrar-reviewed listing coordinates,” never “GPS verified.”

The existing Semaphore flow intentionally hides which approved commitment made a listing. The chain therefore verifies that an approved member authorized these exact terms, but does not publicly connect that hidden commitment to a named owner, wallet, or individual application. If the product later requires a cryptographic owner-to-application link, add a registrar attestation over the application ID, owner wallet, and coordinate hash, then require that attestation in `createListing`. Do not expose an identity commitment to get that link.

## Privacy and operations

Exact residential coordinates become public and permanent when a listing is created. The application must obtain clear owner consent before submission and again before listing. Owners should use a safe meeting point or a coarser pin if revealing the exact home address is unsafe; the current on-chain format supports six decimal places but should not silently claim privacy.

The location-aware registry is deployed on Hedera testnet at `0xCB63F343D4b4151bfe75E8617144e72E99D7667B`; `/app` uses its generated ABI and address. The previous registry at `0xb7Bd37F38129A93f49CeF030E63Cfb48D6F52e9E` remains configured as a read and purchase source for active listings. Existing listings there keep the old code and have no on-chain coordinates. Existing approvals do not automatically carry to the new registry; owners must submit a location-bearing application for the registrar to approve on the new contract.
