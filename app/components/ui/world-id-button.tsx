"use client";

import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useWallet } from "@/components/providers";
import { useWorldVerification } from "@/lib/world/use-world-verification";
import { isDevSimulator } from "@/lib/world/client";
import type { WorldAction } from "@/lib/world/config";

/**
 * Real IDKit enrollment. The visual shell is unchanged from the mock; the three stages
 * are now driven by an actual proof and an actual server round-trip, and the flow can
 * fail -- which the IDKit bounty requires us to demonstrate.
 */
export function WorldIdButton({
  action,
  label = "Verify with World ID",
  onVerified,
  variant = "primary",
}: {
  action: WorldAction;
  label?: string;
  onVerified?: () => void;
  variant?: "primary" | "ghost" | "verified";
}) {
  const [open, setOpen] = useState(false);
  const { address } = useWallet();
  const { stage, connectorUri, failureMessage, failureCode, start, reset } =
    useWorldVerification();
  // In simulator mode nothing scans the QR, so we must not show one.
  const simulated = isDevSimulator();
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onVerifiedRef = useRef(onVerified);

  useEffect(() => {
    onVerifiedRef.current = onVerified;
  }, [onVerified]);

  useEffect(() => {
    if (!open || !address) return;
    void start(action, address);
  }, [open, address, action, start]);

  useEffect(() => {
    if (stage !== "verified") return;
    closeTimer.current = setTimeout(() => {
      setOpen(false);
      onVerifiedRef.current?.();
    }, 700);
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, [stage]);

  const close = () => {
    setOpen(false);
    reset();
  };

  const className =
    variant === "ghost"
      ? "btn btn--ghost"
      : variant === "verified"
        ? "btn btn--verified"
        : "btn";

  const heading =
    stage === "failed"
      ? "Not verified"
      : stage === "verified"
        ? "You're verified"
        : stage === "validating"
          ? "Validating the proof"
          : simulated
            ? "Completing via simulator"
            : connectorUri
              ? "Scan with World App"
              : "Checking a real person";

  const body =
    stage === "failed"
      ? failureMessage
      : stage === "verified"
        ? "Your wallet is bound to a unique identity, recorded on-chain. This identity cannot be linked to a second wallet."
        : simulated
          ? "Development mode: the World ID Simulator is completing this request. No device is involved and there is nothing to scan. The proof itself is real and is verified on the server."
          : stage === "scanning" && connectorUri
            ? "Scan this with World App. The proof is generated on your device — Rent Me Out validates it on the server and stores only a hash, never your face or ID."
            : "A proof is generated on your device. Rent Me Out validates it on the server and stores only a hash — never your face or ID.";

  const statusLine =
    stage === "failed"
      ? "rejected"
      : stage === "verified"
        ? "bound on-chain"
        : stage === "validating"
          ? "POST /api/world/verify"
          : simulated
            ? "simulator · no device"
            : connectorUri
              ? "waiting for your device"
              : "preparing request";

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {label}
      </button>

      {open && (
        <div
          className="worldid-backdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <div
            className="worldid-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="worldid-title"
          >
            <div className="worldid-dialog__top">
              <span className="worldid-mark" aria-hidden="true">
                <span />
              </span>
              <span className="micro dim">Verified with World ID</span>
              <button
                type="button"
                className="worldid-close"
                aria-label="Close"
                onClick={close}
              >
                ×
              </button>
            </div>

            <div className="worldid-dialog__body">
              {stage === "scanning" && connectorUri && !simulated ? (
                /* The real IDKit connector URI. Rendered only as a QR -- it carries the
                   bridge encryption key, so it is never logged or shown as text. */
                <div className="worldid-qr">
                  <QRCodeSVG
                    value={connectorUri}
                    size={184}
                    bgColor="#ffffff"
                    fgColor="#16233b"
                    level="M"
                    marginSize={1}
                  />
                </div>
              ) : (
                <div
                  className="worldid-scan"
                  data-stage={stage === "failed" ? "scanning" : stage}
                  aria-hidden="true"
                >
                  <span className="worldid-scan__ring worldid-scan__ring--1" />
                  <span className="worldid-scan__ring worldid-scan__ring--2" />
                  <span className="worldid-scan__ring worldid-scan__ring--3" />
                  <span className="worldid-scan__face" />
                  <span className="worldid-scan__line" />
                </div>
              )}

              <h2 id="worldid-title">{heading}</h2>
              <p aria-live="polite">{body}</p>

              <div className="worldid-status">
                {stage !== "failed" && stage !== "verified" && (
                  <span className="spinner" aria-hidden="true" />
                )}
                <span className="mono">{failureCode ?? statusLine}</span>
                <span className="micro dim">{action}</span>
              </div>

              {stage === "failed" && (
                <div className="flex wrap gap-8" style={{ marginTop: 12 }}>
                  <button
                    type="button"
                    className="btn btn--small"
                    onClick={() => address && void start(action, address)}
                  >
                    Try again
                  </button>
                  <button type="button" className="btn btn--ghost btn--small" onClick={close}>
                    Cancel
                  </button>
                </div>
              )}

              <p className="worldid-disclaimer">
                Proof of Human on World ID 4.0. World ID proves personhood and
                uniqueness — it does not prove property title.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
