"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@/components/providers";
import { QRPanel } from "@/components/ui/qr-panel";

/**
 * The code a broker shows at the door, for a room they actually hold.
 *
 * It pointed at a fixed room on a domain that does not serve the app, so scanning it
 * during a demo would not have reached this page at all.
 */
interface Room {
  listingId: string;
  holder: string | null;
}

export function BrokerDoorQr() {
  const { address } = useWallet();
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/rooms");
        if (!res.ok) return;
        const data = (await res.json()) as { rooms: Room[] };
        if (!cancelled) setRooms(data.rooms);
      } catch {
        // Leave the panel empty rather than show a code for someone else's room.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const held = (rooms ?? []).find(
    (r) => r.holder && address && r.holder.toLowerCase() === address.toLowerCase(),
  );

  if (!held) {
    return (
      <p className="buy-panel__note">
        {address
          ? "You hold no room rights yet, so there is nothing to prove at a door."
          : "Connect your wallet to get the code for a room you hold."}
      </p>
    );
  }

  return (
    <QRPanel
      value={`${origin}/verify/rmo-3b-andheri?room=${held.listingId}`}
      title={`Room ${held.listingId} verification`}
      note="The tenant scans this, sees your holder wallet, and can run a fresh World ID presence check."
    />
  );
}
