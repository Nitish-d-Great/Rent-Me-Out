"use client";

import { useEffect, useState } from "react";
import type { Room } from "@/lib/data";
import type { RoomRecord } from "./registry";
import { recordToRoom, shortAddress } from "./to-room";

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

function toRoom(r: ApiRoom, index: number): Room {
  return recordToRoom(r as unknown as RoomRecord, index);
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

export { shortAddress };
