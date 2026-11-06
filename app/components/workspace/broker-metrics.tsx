"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@/components/providers";
import { formatDate } from "@/lib/data";

/**
 * Headline figures for the connected broker, derived from the chain.
 *
 * "Rights held" counts rooms the registry says this wallet holds; "paid" sums their
 * RoomPurchased events. Both were hardcoded before, so the page reported rights for a
 * wallet that might hold none.
 */

interface Room {
  listingId: string;
  state: string;
  holder: string | null;
  end: string;
}
interface Purchase {
  listingId: string;
  price: string;
}

export function BrokerMetrics() {
  const { address } = useWallet();
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [purchases, setPurchases] = useState<Purchase[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [roomsRes, buysRes] = await Promise.all([
          fetch("/api/rooms"),
          fetch(address ? `/api/purchases?broker=${address}` : "/api/purchases"),
        ]);
        if (!roomsRes.ok || !buysRes.ok) return;
        const roomsData = (await roomsRes.json()) as { rooms: Room[] };
        const buysData = (await buysRes.json()) as { purchases: Purchase[] };
        if (cancelled) return;
        setRooms(roomsData.rooms);
        setPurchases(buysData.purchases);
      } catch {
        // Leave the placeholders showing rather than claiming zero rights.
      }
    })();
    return () => { cancelled = true; };
  }, [address]);

  const held = address
    ? (rooms ?? []).filter(
        (r) => r.holder && r.holder.toLowerCase() === address.toLowerCase(),
      )
    : [];
  const paid = (purchases ?? []).reduce((sum, p) => sum + Number(p.price), 0);
  const latestEnd = held
    .map((r) => r.end.slice(0, 10))
    .sort()
    .at(-1);

  const loading = rooms === null || purchases === null;

  return (
    <div className="metric-row">
      <div className="metric">
        <div className="metric__label">Rights held</div>
        <div className="metric__value">
          {loading ? "—" : held.length}{" "}
          <small>
            {held.length === 1 ? `Room ${held[0].listingId}` : "rooms"}
          </small>
        </div>
      </div>
      <div className="metric">
        <div className="metric__label">Paid</div>
        <div className="metric__value">
          {loading ? "—" : paid.toLocaleString()} <small>dUSDC</small>
        </div>
      </div>
      <div className="metric">
        <div className="metric__label">Valid until</div>
        <div className="metric__value" style={{ fontSize: 18 }}>
          {latestEnd ? formatDate(latestEnd) : "—"}
        </div>
      </div>
      <div className="metric">
        <div className="metric__label">Presence checks</div>
        <div className="metric__value">
          0 <small>this session</small>
        </div>
      </div>
    </div>
  );
}
