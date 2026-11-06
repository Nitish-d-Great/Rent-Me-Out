"use client";

import { useCallback, useRef, useState } from "react";
import { enroll, WorldError, type EnrollFailure } from "./client";
import type { WorldAction } from "./config";

/**
 * Drives the enrollment UI. Exposes the same three stages the mock
 * `WorldIdButton` already animates, so the visual shell is unchanged -- but now
 * `validating` is a real server round-trip rather than a timer, and the flow can fail.
 */
/**
 * `scanning` means the QR is up and we are waiting for the user's device.
 * `validating` means the proof arrived and we are asking our own server.
 * They were previously collapsed, which made the dialog claim it was validating
 * while it was really still waiting for a phone that had nothing to scan.
 */
export type Stage = "idle" | "scanning" | "validating" | "verified" | "failed";

export interface WorldVerification {
  stage: Stage;
  /** IDKit's raw error code when there is one — shown in dev so failures are diagnosable. */
  failureCode: string | null;
  /** IDKit connector URI. Render as a QR only -- never log or display as text. */
  connectorUri: string | null;
  /** Set when stage is "failed". */
  failure: EnrollFailure | null;
  /** Human-readable copy for the failure, safe to render. */
  failureMessage: string | null;
  start: (action: WorldAction, wallet: string) => Promise<void>;
  reset: () => void;
}

const FAILURE_COPY: Record<EnrollFailure, string> = {
  cancelled: "Verification was cancelled. Nothing was submitted — you can try again.",
  idkit_failed:
    "World App could not complete the verification. The exact reason is in the browser console.",
  identity_already_linked:
    "This identity is already linked to another wallet. One person may hold one wallet.",
  wallet_already_bound:
    "This wallet is already bound to a different identity. Use a different wallet.",
  verification_failed:
    "That proof could not be verified. Please try again, or use a different device.",
  server_error:
    "Your proof was accepted, but we could not record it. This is a problem on our side, not with your verification.",
  network: "Could not reach the verifier. Check your connection and try again.",
};

export function useWorldVerification(): WorldVerification {
  const [stage, setStage] = useState<Stage>("idle");
  const [connectorUri, setConnectorUri] = useState<string | null>(null);
  const [failure, setFailure] = useState<EnrollFailure | null>(null);
  const [failureCode, setFailureCode] = useState<string | null>(null);
  const inFlight = useRef(false);

  const reset = useCallback(() => {
    setStage("idle");
    setFailure(null);
    setConnectorUri(null);
  }, []);

  const start = useCallback(async (action: WorldAction, wallet: string) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setFailure(null);
    setConnectorUri(null);
    setStage("scanning");

    try {
      await enroll(
        action,
        wallet,
        (uri) => setConnectorUri(uri),
        () => setStage("validating"),
      );
      setStage("verified");
    } catch (error) {
      setFailure(error instanceof WorldError ? error.kind : "network");
      setFailureCode(error instanceof WorldError ? (error.code ?? null) : null);
      setStage("failed");
    } finally {
      inFlight.current = false;
    }
  }, []);

  return {
    stage,
    connectorUri,
    failure,
    failureCode,
    failureMessage: failure ? FAILURE_COPY[failure] : null,
    start,
    reset,
  };
}
