"use client";

import { useEffect, useRef, useState } from "react";

type Stage = "scanning" | "validating" | "verified";

export function WorldIdButton({
  action,
  label = "Verify with World ID",
  onVerified,
  variant = "primary",
}: {
  action: "owner-verify" | "broker-verify" | "broker-presence";
  label?: string;
  onVerified?: () => void;
  variant?: "primary" | "ghost" | "verified";
}) {
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<Stage>("scanning");
  const timerRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const onVerifiedRef = useRef(onVerified);

  useEffect(() => {
    onVerifiedRef.current = onVerified;
  }, [onVerified]);

  useEffect(() => {
    if (!open) return;
    setStage("scanning");
    timerRef.current.forEach(clearTimeout);
    timerRef.current = [
      setTimeout(() => setStage("validating"), 900),
      setTimeout(() => setStage("verified"), 1850),
      setTimeout(() => {
        setOpen(false);
        onVerifiedRef.current?.();
      }, 2550),
    ];
    return () => {
      timerRef.current.forEach(clearTimeout);
    };
  }, [open]);

  const className =
    variant === "ghost"
      ? "btn btn--ghost"
      : variant === "verified"
        ? "btn btn--verified"
        : "btn";

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
            if (event.target === event.currentTarget) setOpen(false);
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
                onClick={() => setOpen(false)}
              >
                ×
              </button>
            </div>

            <div className="worldid-dialog__body">
              <div
                className="worldid-scan"
                data-stage={stage}
                aria-hidden="true"
              >
                <span className="worldid-scan__ring worldid-scan__ring--1" />
                <span className="worldid-scan__ring worldid-scan__ring--2" />
                <span className="worldid-scan__ring worldid-scan__ring--3" />
                <span className="worldid-scan__face" />
                <span className="worldid-scan__line" />
              </div>

              <h2 id="worldid-title">
                {stage === "scanning"
                  ? "Checking a real person"
                  : stage === "validating"
                    ? "Validating the proof"
                    : "You're verified"}
              </h2>
              <p>
                {stage === "verified"
                  ? "Your wallet is bound to a unique nullifier. This identity cannot be linked to a second wallet."
                  : "A proof is generated on your device. Rent Me Out validates it on the server and stores only a nullifier — never your face or ID."}
              </p>

              <div className="worldid-status">
                <span className="spinner" aria-hidden="true" />
                <span className="mono">
                  {stage === "scanning"
                    ? "reading orb"
                    : stage === "validating"
                      ? "POST /api/world/verify"
                      : `nullifier 0x7a3f…c91e`}
                </span>
                <span className="micro dim">{action}</span>
              </div>

              <p className="worldid-disclaimer">
                Simulator used for this testnet demo. World ID proves
                personhood and uniqueness; it does not prove property title.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
