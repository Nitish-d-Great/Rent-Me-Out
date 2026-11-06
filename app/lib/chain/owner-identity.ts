"use client";

import { Identity } from "@semaphore-protocol/core";

/**
 * The owner's Semaphore identity, created and kept on their own device.
 *
 * The secret never leaves the browser. The registrar approves only the commitment, and
 * later sees a listing proof that reveals nothing about which approved property made
 * it -- that unlinkability is the whole point, and it fails the moment the server
 * learns the secret.
 *
 * localStorage is demo-grade custody: a real owner would hold this in a wallet.
 */

const KEY = "rmo.owner.identity";

export interface OwnerIdentity {
  seed: string;
  commitment: string;
}

function randomSeed(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Returns the stored identity, creating one on first use. */
export function getOrCreateIdentity(): OwnerIdentity {
  const existing = localStorage.getItem(KEY);
  if (existing) {
    try {
      const parsed = JSON.parse(existing) as OwnerIdentity;
      if (parsed.seed && parsed.commitment) return parsed;
    } catch {
      // Corrupt entry: fall through and mint a fresh one.
    }
  }
  const seed = randomSeed();
  const identity = new Identity(seed);
  const record = { seed, commitment: identity.commitment.toString() };
  localStorage.setItem(KEY, JSON.stringify(record));
  return record;
}

/** The stored identity, or null if this device has never created one. */
export function readIdentity(): OwnerIdentity | null {
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as OwnerIdentity;
  } catch {
    return null;
  }
}

/** Rebuilds the Semaphore identity from the stored seed, for proving. */
export function toIdentity(record: OwnerIdentity): Identity {
  return new Identity(record.seed);
}
