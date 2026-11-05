import type { Metadata } from "next";
import Link from "next/link";
import { ListingForm } from "@/components/workspace/listing-form";

export const metadata: Metadata = {
  title: "Create a room listing",
};

export default function NewListingPage() {
  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">Owner · create listing</p>
          <h1>One token for each room.</h1>
          <p>
            Choose an approved property, a period that does not overlap an active
            listing, and one upfront price per room. The broker pays once for the
            whole period.
          </p>
        </div>
        <div className="page-head__actions">
          <Link href="/owner" className="btn btn--small btn--ghost">
            Back to dashboard
          </Link>
        </div>
      </div>

      <ListingForm />
    </>
  );
}
