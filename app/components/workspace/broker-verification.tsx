"use client";

import { useWalletVerified } from "@/lib/chain/use-owner";
import { useWallet } from "@/components/providers";
import { VerifyBadge } from "@/components/ui/verify-badge";
import { WorldIdButton } from "@/components/ui/world-id-button";

export function BrokerVerification() {
  const { connected, connect, address, rotate, isInjected } = useWallet();
  const { verified, identityShort, confirm: setVerified } = useWalletVerified(address);

  if (verified) {
    return (
      <div className="notice notice--verified">
        <span className="notice__icon" aria-hidden="true">
          ✓
        </span>
        <div>
          <strong>Verified broker.</strong>
          <p>
            Your wallet is verified with World ID and can buy room tokens.
            One World ID identity is bound to this wallet only.
          </p>
          <div style={{ marginTop: 10 }}>
            <VerifyBadge label="Verified broker" hash={identityShort} />
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
          person, and records this wallet as verified on-chain.
        </p>
        <div className="flex wrap gap-8" style={{ marginTop: 12 }}>
          {!connected ? (
            <button type="button" className="btn btn--small" onClick={() => void connect()}>
              Connect wallet
            </button>
          ) : (
            <WorldIdButton
              action="broker-verify"
              label="Verify with World ID"
              onVerified={setVerified}
            />
          )}
          <span className="badge badge--quiet">One person · one wallet</span>
          {process.env.NODE_ENV !== "production" && connected && !isInjected && (
            <button type="button" className="linklike micro" onClick={rotate}>
              dev: new wallet ({address?.slice(0, 6)}…{address?.slice(-4)})
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
