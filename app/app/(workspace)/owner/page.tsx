import type { Metadata } from "next";
import Link from "next/link";
import { OwnerDashboard } from "@/components/workspace/owner-dashboard";

export const metadata: Metadata = {
  title: "Owner workspace",
};

export default function OwnerPage() {
  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">Owner workspace</p>
          <h1>Your properties and room rights.</h1>
          <p>
            Submit a deed, wait for registrar approval, then list individual
            rooms for a fixed period. One room right is one token.
          </p>
        </div>
        <div className="page-head__actions">
          <Link href="/owner/new" className="btn btn--small">
            Submit property
          </Link>
          <Link href="/owner/listings/new" className="btn btn--small btn--ghost">
            Create listing
          </Link>
        </div>
      </div>

      <OwnerDashboard />
    </>
  );
}
