"use client";

import { useCallback, useState } from "react";
import { QRPanel } from "@/components/ui/qr-panel";
import { startViewingCheck, submitReceipt, type TenantResult } from "@/lib/world/client";
import { brokerPresenceUrl } from "@/lib/world/link";
import { useQrScanner } from "@/lib/world/use-qr-scanner";
import type { SignedChallenge } from "@/lib/world/challenge";

/**
 * The tenant's live broker check. Two hops, both over QR:
 *   1. we show a challenge the broker scans with their phone;
 *   2. the broker's phone returns a server-signed receipt, which we read back.
 *
 * The broker's session handle never reaches this device, and this device never sees the
 * signing secret -- which is exactly why a receipt cannot be forged by the broker.
 *
 * A missing or unverifiable receipt is a RED. Absence of proof is never a pass.
 */

type Phase = "idle" | "awaiting" | "reading" | "done" | "error";

const REASON_COPY: Record<string, string> = {
  no_current_holder: "No broker currently holds rights to this room.",
  rights_not_valid: "These rights are frozen or outside their period.",
  session_not_holder: "This person is not the broker who holds these rights.",
  no_session_on_this_device: "The broker has not verified on the device they used.",
  cancelled: "The broker cancelled the check.",
  "receipt_nonce-mismatch": "That code was issued for a different check. Ask for a fresh one.",
  "receipt_room-mismatch": "That code was issued for a different room.",
  receipt_expired: "That code has expired. Start the check again.",
  "receipt_bad-mac": "That code is not genuine.",
  receipt_malformed: "That code could not be read.",
};

export function PresenceCheck({ roomId }: { roomId: string }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [challenge, setChallenge] = useState<SignedChallenge | null>(null);
  const [result, setResult] = useState<TenantResult | null>(null);
  const [pasted, setPasted] = useState("");
  const [error, setError] = useState<string | null>(null);

  const consume = useCallback(
    async (receipt: string) => {
      if (!challenge) return;
      setPhase("reading");
      const verdict = await submitReceipt(roomId, receipt.trim(), challenge.nonce);
      setResult(verdict);
      setPhase("done");
    },
    [challenge, roomId],
  );

  const scanner = useQrScanner((value) => void consume(value));

  const begin = async () => {
    setError(null);
    setResult(null);
    try {
      const issued = await startViewingCheck(roomId);
      setChallenge(issued);
      setPhase("awaiting");
    } catch {
      setError("Could not start the check. Try again.");
      setPhase("error");
    }
  };

  const restart = () => {
    scanner.stop();
    setChallenge(null);
    setResult(null);
    setPasted("");
    setPhase("idle");
  };

  if (phase === "idle" || phase === "error") {
    return (
      <div className="notice notice--brass">
        <span className="notice__icon" aria-hidden="true">?</span>
        <div style={{ flex: 1 }}>
          <strong>Is this the broker who holds the rights?</strong>
          <p>
            Ask them to scan a code. The result is signed by the server, so they cannot
            fake it by showing you their own screen.
          </p>
          {error && <p className="micro" style={{ color: "crimson" }}>{error}</p>}
          <div style={{ marginTop: 12 }}>
            <button type="button" className="btn btn--small" onClick={() => void begin()}>
              Verify this broker
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "done" && result) {
    const copy = result.reason ? REASON_COPY[result.reason] : null;
    return (
      <div className={`notice ${result.match ? "notice--verified" : "notice--alert"}`}>
        <span className="notice__icon" aria-hidden="true">{result.match ? "✓" : "✕"}</span>
        <div style={{ flex: 1 }}>
          <strong>{result.match ? "Verified broker" : "Not verified"}</strong>
          <p>
            {result.match
              ? "This person proved a live check against the session bound on-chain to the wallet holding these rights."
              : (copy ?? "This check did not pass. Do not pay an advance on this claim.")}
          </p>
          {result.match && (
            <p className="micro dim">
              Proves they hold the rights. It does not prove who they are, and we never
              learn their identity.
            </p>
          )}
          <div style={{ marginTop: 12 }}>
            <button type="button" className="btn btn--ghost btn--small" onClick={restart}>
              Check again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="notice">
      <div style={{ flex: 1 }}>
        <strong>Step 1 — ask the broker to scan this</strong>
        {challenge && (
          <QRPanel
            value={brokerPresenceUrl(challenge)}
            title="Broker check"
            note="The broker scans this with their own phone and completes a fresh World ID check."
          />
        )}

        <div style={{ marginTop: 18 }}>
          <strong>Step 2 — read their result code</strong>
          <p className="micro dim">
            Their phone shows a code once the check completes.
          </p>

          {scanner.supported ? (
            <>
              <video
                ref={scanner.videoRef}
                playsInline
                muted
                style={{
                  width: "100%",
                  maxWidth: 320,
                  borderRadius: 8,
                  display: scanner.scanning ? "block" : "none",
                  marginTop: 10,
                }}
              />
              <div className="flex wrap gap-8" style={{ marginTop: 10 }}>
                {!scanner.scanning ? (
                  <button type="button" className="btn btn--small" onClick={() => void scanner.start()}>
                    Scan their code
                  </button>
                ) : (
                  <button type="button" className="btn btn--ghost btn--small" onClick={scanner.stop}>
                    Stop scanning
                  </button>
                )}
                <button type="button" className="btn btn--ghost btn--small" onClick={restart}>
                  Start over
                </button>
              </div>
              {scanner.error && (
                <p className="micro" style={{ color: "crimson" }}>{scanner.error}</p>
              )}
            </>
          ) : null}

          {(!scanner.supported || scanner.error) && (
            <div className="flex wrap gap-8" style={{ marginTop: 10 }}>
              <input
                className="input mono"
                value={pasted}
                onChange={(event) => setPasted(event.target.value)}
                placeholder="rmo1.…"
                aria-label="Paste the broker's result code"
                style={{ flex: 1, minWidth: 200 }}
              />
              <button
                type="button"
                className="btn btn--small"
                disabled={!pasted.trim() || phase === "reading"}
                onClick={() => void consume(pasted)}
              >
                {phase === "reading" ? "Checking…" : "Check code"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
