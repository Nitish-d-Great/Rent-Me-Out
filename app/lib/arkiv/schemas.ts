import { addr, bytes, defineSchema, str, u64 } from "@arkiv-network/sdk/schema";

/**
 * Everything RentMeOut publishes to Arkiv. Entities are public, so nothing here may
 * identify a property or its owner: application details stay encrypted on Swarm, and
 * `sealedRef` points at that ciphertext. It is a plain reference, so it holds no key.
 */

/** The registrar's review queue. Expires 90 days after submission. */
export const PropertyApplication = defineSchema("rentmeout.property-application.v1", {
  registry: addr().indexed(),
  applicationId: str().indexed(),
  status: str().indexed(),
  /** Hash of the owner's commitment, so their device can find its own applications. */
  ownerTag: str().indexed(),
  submittedAt: u64().indexed(),
  sealedRef: str(),
  decidedAt: u64().optional(),
  decisionTx: str().optional(),
  reason: bytes().optional(),
});

/** A searchable room. Expires when its rental period ends. */
export const RoomListing = defineSchema("rentmeout.room-listing.v1", {
  registry: addr().indexed(),
  listingId: u64().indexed(),
  status: str().indexed(),
  city: str().indexed(),
  priceUsdc: u64().indexed(),
  startsAt: u64().indexed(),
  endsAt: u64().indexed(),
  payout: addr().indexed(),
  token: addr(),
  label: str(),
  listingTx: str(),
});

/** Public proof of a sale, looked up by room or holder. Expires with the rights. */
export const RightsRecord = defineSchema("rentmeout.rights-record.v1", {
  registry: addr().indexed(),
  listingId: u64().indexed(),
  holder: addr().indexed(),
  validUntil: u64().indexed(),
  validFrom: u64(),
  token: addr(),
  purchaseTx: str(),
});

/** Minimal public wallet profile; never add personal or identity documents here. */
export const UserProfile = defineSchema("rentmeout.user-profile.v1", {
  profileId: str().indexed(),
  wallet: addr().indexed(),
  role: str().indexed(),
});
