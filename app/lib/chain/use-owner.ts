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
  latitudeE6?: number;
  longitudeE6?: number;
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
  /** Short form of this wallet's on-chain identity hash, once known. */
  identityShort?: string;
  confirm: () => void;
} {
  const [known, setKnown] = useState<Record<string, boolean>>({});
  const [identities, setIdentities] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/world/status?wallet=${address}`);
        const data = (await res.json()) as { verified?: boolean; identity?: string | null };
        if (cancelled) return;
        setKnown((prev) => ({ ...prev, [address]: Boolean(data.verified) }));
        const { identity } = data;
        if (identity) {
          setIdentities((prev) => ({ ...prev, [address]: `${identity.slice(0, 10)}…${identity.slice(-4)}` }));
        }
      } catch {
        // Unknown stays unverified: the on-chain check still decides at purchase.
        if (!cancelled) setKnown((prev) => ({ ...prev, [address]: false }));
      }
    })();
    return () => { cancelled = true; };
  }, [address]);

  const confirm = useCallback(() => {
    if (!address) return;
    setKnown((prev) => ({ ...prev, [address]: true }));
    // A verification just succeeded, so read back the identity it created.
    void fetch(`/api/world/status?wallet=${address}`)
      .then((res) => res.json())
      .then((data: { identity?: string | null }) => {
        const { identity } = data;
        if (identity) {
          setIdentities((prev) => ({ ...prev, [address]: `${identity.slice(0, 10)}…${identity.slice(-4)}` }));
        }
      })
      .catch(() => undefined);
  }, [address]);

  return {
    verified: address ? Boolean(known[address]) : false,
    checking: Boolean(address) && known[address!] === undefined,
    identityShort: address ? identities[address] : undefined,
    confirm,
  };
}
