import type { Metadata } from "next";
import { MarketplaceClient } from "@/components/marketplace/marketplace-client";
import { demo, marketplaceRooms } from "@/lib/data";

export const metadata: Metadata = {
  title: "Browse rooms",
  description:
    "Available room-rights listings with a registrar-approved property and one verified broker per room.",
};

export default function MarketplacePage() {
  const rooms = marketplaceRooms.map((room) => ({
    ...room,
    propertyApproved: true,
  }));

  return (
    <div className="shell section section--tight">
      <div className="page-head">
        <div>
          <p className="eyebrow">Public marketplace</p>
          <h1>One room. One holder.</h1>
          <p>
            Room rights from registrar-approved properties. Prices are one-time
            payments to the owner for the whole period — not monthly rent.
          </p>
        </div>
        <div className="page-head__actions">
          <span className="badge badge--quiet">
            {demo.periodLabel} · {rooms.length} listings
          </span>
        </div>
      </div>

      <MarketplaceClient rooms={rooms} />

      <p className="verify-footnote" style={{ maxWidth: 720 }}>
        A listing only appears after the property is approved on Hedera and the
        room token exists. Arkiv supplies discovery; Hedera confirms the current
        holder and lifecycle. Tenant rent and lease terms are agreed with the
        broker outside this product.
      </p>
    </div>
  );
}
