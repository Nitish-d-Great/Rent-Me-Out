"use client";

import { useState } from "react";
import { useWallet } from "@/components/providers";
import { VerifyBadge } from "@/components/ui/verify-badge";
import { WorldIdButton } from "@/components/ui/world-id-button";

export function OwnerVerification() {
  const { connected, connect } = useWallet();
  const [verified, setVerified] = useState(false);

  if (verified) {
    return (
      <div className="notice notice--verified">
        <span className="notice__icon" aria-hidden="true">
          ✓
        </span>
        <div>
          <strong>Owner verified.</strong>
          <p>
            Your wallet is on the ATS allowlist. Submit a property and the
            registrar will review the deed. Listing stays locked until approval.
          </p>
          <div style={{ marginTop: 10 }}>
            <VerifyBadge label="Owner verified" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="notice notice--brass">
      <span className="notice__icon" aria-hidden="true">
        !
      </span>
      <div style={{ flex: 1 }}>
        <strong>Two checks before you can list a room.</strong>
        <p>
          Verify a unique person with World ID, then wait for the registrar to
          approve the deed. The submit button stays locked until both are done.
        </p>
        <div className="flex wrap gap-8" style={{ marginTop: 12 }}>
          {!connected ? (
            <button type="button" className="btn btn--small" onClick={connect}>
              Connect wallet
            </button>
          ) : (
            <WorldIdButton
              action="owner-verify"
              label="Verify with World ID"
              onVerified={() => setVerified(true)}
            />
          )}
          <span className="badge badge--quiet">Registrar review comes next</span>
        </div>
      </div>
    </div>
  );
}
