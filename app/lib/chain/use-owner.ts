"use client";

import { useCallback, useEffect, useState } from "react";
import { readIdentity } from "./owner-identity";

/** An application as the API returns it: Arkiv status plus decrypted Swarm details. */
export interface OwnerApplication {
  applicationId: string;
  status: "pending" | "approved" | "rejected";
  submittedAt: string;
  decidedAt?: string;
  transactionHash?: string;
  reason?: string;
  commitment: string;
  nickname: string;
  locality: string;
  city: string;
  rooms: number;
  deedName: string;
}

export type LoadState = "loading" | "ready" | "unavailable";

/** The applications this device's owner identity has submitted. */
export function useOwnerApplications(): {
  applications: OwnerApplication[];
  state: LoadState;
  hasIdentity: boolean;
} {
  const [applications, setApplications] = useState<OwnerApplication[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [hasIdentity, setHasIdentity] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const identity = readIdentity();
      if (!identity) {
        if (!cancelled) {
          setHasIdentity(false);
          setState("ready");
        }
        return;
      }
      try {
        const res = await fetch(`/api/properties?commitment=${identity.commitment}`);
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { applications: OwnerApplication[] };
        if (cancelled) return;
        setApplications(data.applications);
        setState("ready");
      } catch {
        if (!cancelled) setState("unavailable");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { applications, state, hasIdentity };
}

/**
 * Whether a wallet is enrolled with World ID, read from the identity registry. `confirm`
 * records a verification that just succeeded, so the UI need not wait for a re-read.
 */
export function useWalletVerified(address: string | null): {
  verified: boolean;
  checking: boolean;
  confirm: () => void;
} {
  const [known, setKnown] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/world/status?wallet=${address}`);
        const data = (await res.json()) as { verified?: boolean };
        if (!cancelled) setKnown((prev) => ({ ...prev, [address]: Boolean(data.verified) }));
      } catch {
        // Unknown stays unverified: the on-chain check still decides at purchase.
        if (!cancelled) setKnown((prev) => ({ ...prev, [address]: false }));
      }
    })();
    return () => { cancelled = true; };
  }, [address]);

  const confirm = useCallback(() => {
    if (address) setKnown((prev) => ({ ...prev, [address]: true }));
  }, [address]);

  return {
    verified: address ? Boolean(known[address]) : false,
    checking: Boolean(address) && known[address!] === undefined,
    confirm,
  };
}
