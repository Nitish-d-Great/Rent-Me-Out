"use client";

import { useState } from "react";
import { useWallet } from "@/components/providers";
import { VerifyBadge } from "@/components/ui/verify-badge";
import { WorldIdButton } from "@/components/ui/world-id-button";

export function BrokerVerification() {
  const { connected, connect } = useWallet();
  const [verified, setVerified] = useState(false);

  if (verified) {
    return (
      <div className="notice notice--verified">
        <span className="notice__icon" aria-hidden="true">
          ✓
        </span>
        <div>
          <strong>Verified broker.</strong>
          <p>
            Your wallet is on the ATS verified list and can receive room tokens.
            One World ID identity is bound to this wallet only.
          </p>
          <div style={{ marginTop: 10 }}>
            <VerifyBadge label="Verified broker" />
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
        <strong>Buying stays locked until World ID is validated.</strong>
        <p>
          The backend checks the proof, rejects a second wallet for the same
          person, and adds this wallet to the ATS verified list.
        </p>
        <div className="flex wrap gap-8" style={{ marginTop: 12 }}>
          {!connected ? (
            <button type="button" className="btn btn--small" onClick={connect}>
              Connect wallet
            </button>
          ) : (
            <WorldIdButton
              action="broker-verify"
              label="Verify with World ID"
              onVerified={() => setVerified(true)}
            />
          )}
          <span className="badge badge--quiet">One person · one wallet</span>
        </div>
      </div>
    </div>
  );
}
