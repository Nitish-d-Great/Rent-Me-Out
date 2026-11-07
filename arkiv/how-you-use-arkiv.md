# How we use Arkiv

Arkiv is part of the path a renter can see. The marketplace sends city, status and price
filters to an Arkiv query, then uses Hedera to confirm the current holder and lifecycle
before it offers a room. The free-text box narrows the returned cards in the browser; it
is not an Arkiv filter.

| What the user does | Arkiv query | What changes on screen |
|---|---|---|
| Choose a city | `RoomListing.city = ...` | Only listings indexed for that city remain. |
| Choose available or held | `RoomListing.status = available/sold` | Marketplace results match the indexed state; Hedera still confirms the current state. |
| Choose a price band | `priceUsdc < 900 USDC` or `priceUsdc >= 900 USDC` | Results are filtered by the indexed price, in six-decimal USDC units. |
| Open the registrar queue | `PropertyApplication` by registry and pending status | The registrar sees applications for this deployment that still need review. |
| Open “My properties” | `PropertyApplication` by owner tag | The owner's browser finds applications linked to its commitment. |
| Verify a room | `RightsRecord` by registry/listing | The public page can show the Arkiv record link beside the Hedera result. |

The backend wallet owns the Arkiv entities and pays the tGLM fee. That is a product
tradeoff: a broker or owner can use the app without first funding a Rabdi wallet, but
cannot edit their entity directly. The room's `payout` field is the owner's wallet; it
does not make that wallet the Arkiv entity owner. Every read also filters on the backend
writer and the configured Hedera registry, so records from a different writer or an old
deployment do not enter this app's results.

An application expires 90 days after submission. A room listing and rights record
expire at the end of their rental period, capped at 180 days because of Arkiv's current
maximum lifetime. Longer rentals therefore need an extension flow, which we have not
built. On a sale or freeze, the app patches the indexed status after Hedera changes. The
network expiry handles cleanup for a normal-length rental; no scheduled database cleanup
is needed.

The implementation is in [`listings.ts`](../app/lib/arkiv/listings.ts),
[`schemas.ts`](../app/lib/arkiv/schemas.ts) and the marketplace page. The data-layer
script exercises application submission, approval, listing search, sale and status sync
against configured networks. We have not rerun it as part of this change.
