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
            Connect an allowlisted Rabdi wallet to review pending Arkiv
            applications. The owner shares the deed key file separately; it is
            used in this browser and is never uploaded to Arkiv.
          </p>
        </div>
        <div className="page-head__actions">
          <span className="badge badge--brass">Wallet allowlist · Rabdi</span>
        </div>
      </div>

      <RegistrarConsole />
    </>
  );
}
