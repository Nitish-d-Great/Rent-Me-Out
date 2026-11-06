import type { Metadata } from "next";
import { UserProfileEntity } from "@/components/workspace/user-profile-entity";

export const metadata: Metadata = { title: "Public profile" };

export default function ProfilePage() {
  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">Arkiv profile</p>
          <h1>Publish a wallet-linked role.</h1>
          <p>Create a public profile entity for your owner, renter, or broker wallet. It expires after 180 days and can be renewed before expiry.</p>
        </div>
      </div>
      <UserProfileEntity />
    </>
  );
}
