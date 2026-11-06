"use client";

import Link from "next/link";
import { useState } from "react";
import { useWallet } from "@/components/providers";
import { VerifyBadge } from "@/components/ui/verify-badge";
import { WorldIdButton } from "@/components/ui/world-id-button";
import { demo, formatDate, formatUsdc, type Room } from "@/lib/data";

type Step = "idle" | "processing" | "done";

export function BuyPanel({ room }: { room: Room }) {
  const { connected, connect } = useWallet();
  const [verified, setVerified] = useState(false);
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);

  const held = room.state !== "available";

  const buy = () => {
    setError(null);
    setStep("processing");
    window.setTimeout(() => setStep("done"), 1700);
  };

  if (held) {
    return (
      <aside className="buy-panel">
        <div className="buy-panel__head">
          <span className="badge badge--brass">Sold for this period</span>
          <div className="buy-panel__price" style={{ marginTop: 16 }}>
            {formatUsdc(room.price)} <small>USDC</small>
          </div>
        </div>
        <div className="buy-panel__body">
          <div className="notice notice--brass">
            <span className="notice__icon" aria-hidden="true">
              ✓
            </span>
            <div>
              <strong>Room 2 has one current holder.</strong>
              <p>
                The token is held by a verified broker until{" "}
                {formatDate(room.validUntil)}.
              </p>
            </div>
          </div>

          <div className="buy-panel__list" style={{ marginTop: 18 }}>
            <div>
              <span>Holder</span>
              <span className="mono">{demo.brokerShort}</span>
            </div>
            <div>
              <span>Rights period</span>
              <span>{demo.periodLabel}</span>
            </div>
            <div>
              <span>Token</span>
              <span className="mono">{room.tokenId}</span>
            </div>
          </div>

          {room.holderNullifier && (
            <VerifyBadge label="Broker" hash={room.holderNullifier} />
          )}

          <Link
            href={`/verify/${demo.propertyId}?room=${room.id}`}
            className="btn btn--wide"
            style={{ marginTop: 18 }}
          >
            Verify this room
          </Link>
          <p className="buy-panel__note">
            Sold rights cannot be resold or cancelled in this demo. At expiry,
            the token is burned and the room can be listed again.
          </p>
        </div>
      </aside>
    );
  }

  return (
    <aside className="buy-panel">
      <div className="buy-panel__head">
        <span className="badge badge--quiet">Available · one token</span>
        <div className="buy-panel__price" style={{ marginTop: 16 }}>
          {formatUsdc(room.price)} <small>USDC / period</small>
        </div>
      </div>

      <div className="buy-panel__body">
        <div className="buy-panel__list">
          <div>
            <span>Rights period</span>
            <span>{demo.periodLabel}</span>
          </div>
          <div>
            <span>Valid from</span>
            <span>{formatDate(demo.periodStart)}</span>
          </div>
          <div>
            <span>Valid until</span>
            <span>{formatDate(demo.periodEnd)}</span>
          </div>
          <div>
            <span>Property</span>
            <span className="green">Registrar-approved</span>
          </div>
        </div>

        {step === "done" ? (
          <div className="notice notice--verified">
            <span className="notice__icon" aria-hidden="true">
              ✓
            </span>
            <div>
              <strong>{room.name.split("·")[0].trim()} bought.</strong>
              <p>
                Payment received and the room token is now held by your wallet.
                Rights are valid until {formatDate(room.validUntil)}.
              </p>
              <p className="mono" style={{ marginTop: 8, wordBreak: "break-all" }}>
                {demo.purchaseTx}
              </p>
              <Link
                href={`/broker/rights`}
                className="text-link"
                style={{ marginTop: 10 }}
              >
                Open my room rights
              </Link>
            </div>
          </div>
        ) : (
          <>
            {!connected && (
              <>
                <p className="buy-panel__note">
                  Connect a Hedera-compatible wallet to buy this room. The token
                  can only be transferred to a verified broker.
                </p>
                <button
                  type="button"
                  className="btn btn--wide"
                  onClick={() => void connect()}
                >
                  Connect wallet
                </button>
              </>
            )}

            {connected && !verified && (
              <>
                <p className="buy-panel__note">
                  Buying is locked until World ID is validated by the backend
                  and your wallet is on the ATS verified list.
                </p>
                <WorldIdButton
                  action="broker-verify"
                  label="Verify with World ID"
                  onVerified={() => setVerified(true)}
                />
              </>
            )}

            {connected && verified && (
              <>
                <VerifyBadge label="Verified broker" />
                <button
                  type="button"
                  className="btn btn--brass btn--wide"
                  style={{ marginTop: 12 }}
                  onClick={buy}
                  disabled={step === "processing"}
                >
                  {step === "processing"
                    ? "Confirming payment and token…"
                    : `Buy ${room.name.split("·")[0].trim()} · ${formatUsdc(room.price)} USDC`}
                </button>
                {step === "processing" && (
                  <p className="buy-panel__note" aria-live="polite">
                    Waiting for USDC settlement and the token transfer. The
                    purchase is not complete until both confirm.
                  </p>
                )}
              </>
            )}

            {error && (
              <div className="notice notice--alert" style={{ marginTop: 14 }}>
                <span className="notice__icon" aria-hidden="true">
                  !
                </span>
                <div>
                  <strong>Insufficient USDC.</strong>
                  <p>
                    Add USDC to your wallet to buy this room, then try again.
                  </p>
                </div>
              </div>
            )}

            {connected && verified && (
              <div className="demo-states">
                <span className="demo-states__label">Demo failure path</span>
                <button
                  type="button"
                  className="demo-chip"
                  onClick={() =>
                    setError(
                      "Insufficient USDC. Add USDC to your wallet to buy this room.",
                    )
                  }
                >
                  Insufficient USDC
                </button>
              </div>
            )}
          </>
        )}

        <p className="buy-panel__note">
          The payment buys the time-limited right to rent the room. Tenant rent,
          deposit and lease terms stay between you and the tenant. There are no
          refunds for an early exit.
        </p>
      </div>
    </aside>
  );
}
