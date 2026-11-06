"use client";

import { useEffect, useState } from "react";
import type { Room, RoomState } from "@/lib/data";

/**
 * Rooms as the registry reports them, mapped into the shape the verify UI already
 * renders. Mapping rather than rewriting the component keeps Anurag's design intact
 * while the data underneath becomes real.
 */

interface ApiRoom {
  listingId: string;
  state: string;
  valid: boolean;
  holder: string | null;
  holderIdentity: string | null;
  start: string;
  end: string;
  price: string;
  roomTag: string;
}

const TINTS = ["tint-a", "tint-b", "tint-c"];

/** 0x1234…abcd — the form the verify UI already uses. */
export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function toRoom(r: ApiRoom, index: number): Room {
  // The registry has no "none"; treat anything unrecognised as available so the page
  // never claims rights that do not exist.
  const state: RoomState =
    r.state === "held" || r.state === "frozen" || r.state === "expired"
      ? (r.state as RoomState)
      : "available";

  return {
    id: r.listingId,
    tokenId: `#${r.listingId} · tag ${r.roomTag.slice(0, 8)}…`,
    name: `Room ${r.listingId}`,
    note: "on-chain listing",
    price: Number(r.price),
    state,
    holder: r.holder ?? undefined,
    holderName: r.holder ? "Verified broker" : undefined,
    // The registry stores a hash of the World ID identity, never a raw nullifier,
    // so this is safe to display.
    holderNullifier: r.holderIdentity
      ? `0x${BigInt(r.holderIdentity).toString(16).slice(0, 12)}…`
      : undefined,
    // formatDate() appends "T00:00:00Z", so it needs a bare YYYY-MM-DD. Passing a full
    // ISO string produces "…000ZT00:00:00Z" and an Invalid Date that crashes the page.
    validFrom: r.start.slice(0, 10),
    validUntil: r.end.slice(0, 10),
    tint: TINTS[index % TINTS.length],
  };
}

export type LiveStatus = "loading" | "live" | "unavailable";

export function useLiveRooms(): {
  rooms: Room[] | null;
  status: LiveStatus;
  rootVersion: string | null;
} {
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [status, setStatus] = useState<LiveStatus>("loading");
  const [rootVersion, setRootVersion] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/rooms");
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { rooms: ApiRoom[]; rootVersion?: string };
        if (cancelled) return;
        if (!data.rooms?.length) {
          // The chain is reachable but holds no listings yet. That is not an error,
          // but it is also not something to present as live rights.
          setStatus("unavailable");
          return;
        }
        setRooms(data.rooms.map(toRoom));
        setRootVersion(data.rootVersion ?? null);
        setStatus("live");
      } catch {
        if (!cancelled) setStatus("unavailable");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { rooms, status, rootVersion };
}
