"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { QRPanel } from "@/components/ui/qr-panel";
import { provePresence, storedSessionId } from "@/lib/world/client";
import { decodeChallenge } from "@/lib/world/link";
import type { SignedChallenge } from "@/lib/world/challenge";

/**
 * The broker's side of a viewing check, opened by scanning the tenant's QR.
 *
 * This runs on the BROKER's device because that is the only place their session handle
 * lives -- the tenant must never see it. The outcome comes back as a server-signed
 * receipt, which the broker shows to the tenant. The broker cannot alter it: the MAC is
 * computed with a secret they do not have, and it is bound to the tenant's nonce.
 */

type Phase = "reading-link" | "ready" | "proving" | "done" | "no-session" | "bad-link";

export function BrokerPresenceClient() {
  const params = useSearchParams();
  const [phase, setPhase] = useState<Phase>("reading-link");
  const [challenge, setChallenge] = useState<SignedChallenge | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [matched, setMatched] = useState<boolean | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [connectorUri, setConnectorUri] = useState<string | null>(null);

  useEffect(() => {
    const encoded = params.get("c");
    if (!encoded) {
      setPhase("bad-link");
      return;
    }
    const decoded = decodeChallenge(encoded);
    if (!decoded) {
      setPhase("bad-link");
      return;
    }
    if (decoded.expiresAt < Math.floor(Date.now() / 1000)) {
      setPhase("bad-link");
      return;
    }
    setChallenge(decoded);
    setPhase(storedSessionId() ? "ready" : "no-session");
  }, [params]);

  const prove = async () => {
    if (!challenge) return;
    setPhase("proving");
    const outcome = await provePresence(challenge.roomId, challenge, setConnectorUri);
    setConnectorUri(null);
    setMatched(outcome.match);
    setReason(outcome.reason ?? null);
    setReceipt(outcome.receipt ?? null);
    setPhase("done");
  };

  if (phase === "reading-link") {
    return <p className="micro dim">Reading the tenant&apos;s check…</p>;
  }

  if (phase === "bad-link") {
    return (
      <div className="notice notice--alert">
        <span className="notice__icon" aria-hidden="true">✕</span>
        <div>
          <strong>That check link is not usable.</strong>
          <p>
            It is missing, malformed, or expired. Ask the tenant to start a fresh check —
            codes are deliberately short-lived so an old one cannot be reused.
          </p>
        </div>
      </div>
    );
  }

  if (phase === "no-session") {
    return (
      <div className="notice notice--brass">
        <span className="notice__icon" aria-hidden="true">!</span>
        <div>
          <strong>No verification on this device.</strong>
          <p>
            Your World ID session is saved in the browser where you verified. Open this
            link in that browser.
          </p>
        </div>
      </div>
    );
  }

  if (phase === "done") {
    return (
      <div className={`notice ${matched ? "notice--verified" : "notice--alert"}`}>
        <span className="notice__icon" aria-hidden="true">{matched ? "✓" : "✕"}</span>
        <div style={{ flex: 1 }}>
          <strong>{matched ? "Check passed — show this to the tenant" : "Check did not pass"}</strong>
          {receipt ? (
            <>
              <QRPanel
                value={receipt}
                title="Signed result"
                note="The tenant scans this. It is signed by the server, so it cannot be altered."
              />
              <p className="micro dim" style={{ marginTop: 8 }}>
                If their camera will not scan, read them the code below.
              </p>
              <p className="mono" style={{ wordBreak: "break-all", fontSize: 11 }}>
                {receipt}
              </p>
            </>
          ) : (
            <p>{reason ? `Reason: ${reason}` : "No signed result was produced."}</p>
          )}
        </div>
      </div>
    );
  }

  if (phase === "proving" && connectorUri) {
    return (
      <div className="notice">
        <div style={{ flex: 1 }}>
          <strong>Scan with your World app</strong>
          <p>Approve on your phone. This page updates on its own.</p>
          {/* QR only: this URI can carry the bridge encryption key, so it is never shown as text. */}
          <div style={{ background: "#fff", display: "inline-block", marginTop: 12, padding: 12 }}>
            <QRCodeSVG value={connectorUri} size={224} level="M" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="notice">
      <div style={{ flex: 1 }}>
        <strong>Prove you hold these rights</strong>
        <p>
          Room <span className="mono">{challenge?.roomId}</span>. Completing this gives the
          tenant a signed result. It reveals nothing about who you are.
        </p>
        <div style={{ marginTop: 12 }}>
          <button
            type="button"
            className="btn btn--small"
            disabled={phase === "proving"}
            onClick={() => void prove()}
          >
            {phase === "proving" ? "Preparing…" : "Complete World ID check"}
          </button>
        </div>
      </div>
    </div>
  );
}
