"use client";

import { useCallback, useRef, useState } from "react";
import { enroll, WorldError, type EnrollFailure } from "./client";
import type { WorldAction } from "./config";

/**
 * Drives the enrollment UI. Exposes the same three stages the mock
 * `WorldIdButton` already animates, so the visual shell is unchanged -- but now
 * `validating` is a real server round-trip rather than a timer, and the flow can fail.
 */
export type Stage = "idle" | "scanning" | "validating" | "verified" | "failed";

export interface WorldVerification {
  stage: Stage;
  /** Set when stage is "failed". */
  failure: EnrollFailure | null;
  /** Human-readable copy for the failure, safe to render. */
  failureMessage: string | null;
  start: (action: WorldAction, wallet: string) => Promise<void>;
  reset: () => void;
}

const FAILURE_COPY: Record<EnrollFailure, string> = {
  cancelled: "Verification was cancelled. Nothing was submitted — you can try again.",
  identity_already_linked:
    "This identity is already linked to another wallet. One person may hold one wallet.",
  verification_failed:
    "That proof could not be verified. Please try again, or use a different device.",
  network: "Could not reach the verifier. Check your connection and try again.",
};

export function useWorldVerification(): WorldVerification {
  const [stage, setStage] = useState<Stage>("idle");
  const [failure, setFailure] = useState<EnrollFailure | null>(null);
  const inFlight = useRef(false);

  const reset = useCallback(() => {
    setStage("idle");
    setFailure(null);
  }, []);

  const start = useCallback(async (action: WorldAction, wallet: string) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setFailure(null);
    setStage("scanning");

    try {
      // The World App is open on the user's device from here until the poll resolves.
      const promise = enroll(action, wallet);
      // Once the proof is in hand we are waiting on our own server, not on the user.
      setStage("validating");
      await promise;
      setStage("verified");
    } catch (error) {
      setFailure(error instanceof WorldError ? error.kind : "network");
      setStage("failed");
    } finally {
      inFlight.current = false;
    }
  }, []);

  return {
    stage,
    failure,
    failureMessage: failure ? FAILURE_COPY[failure] : null,
    start,
    reset,
  };
}
