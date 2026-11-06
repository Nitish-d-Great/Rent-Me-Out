import type { Metadata } from "next";
import { RegistrarConsole } from "@/components/workspace/registrar-console";

export const metadata: Metadata = {
  title: "Registrar console",
};

export default function RegistrarPage() {
  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">Registrar · restricted</p>
          <h1>Review the deed, not the address.</h1>
          <p>
            Pending applications come from Arkiv. The deed is decrypted through an
            audited server route. Approval registers only an opaque property
            commitment on Hedera.
          </p>
        </div>
        <div className="page-head__actions">
          <span className="badge badge--alert">Registrar-only access</span>
        </div>
      </div>

      <RegistrarConsole />
    </>
  );
}
