"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useWallet } from "@/components/providers";
import { StatusStamp } from "@/components/ui/status-stamp";
import { formatDate, type RoomState } from "@/lib/data";

/**
 * The rooms this wallet actually holds, read from the registry.
 *
 * Previously a fixed card claimed rights over Room 2 for whoever opened the page,
 * complete with a holder wallet that was not theirs.
 */

interface Room {
  listingId: string;
  state: string;
  holder: string | null;
  holderIdentity: string | null;
  start: string;
  end: string;
  price: string;
  roomTag: string;
}

export function BrokerRights() {
  const { address, connected, connect } = useWallet();
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/rooms");
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { rooms: Room[] };
        if (!cancelled) setRooms(data.rooms);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!connected) {
    return (
      <section className="panel" id="rights">
        <div className="panel__head">
          <h2>My room rights</h2>
        </div>
        <div className="panel__body">
          <p className="buy-panel__note">
            Connect your wallet to see the room rights it holds on Hedera.
          </p>
          <button type="button" className="btn" onClick={() => void connect()}>
            Connect wallet
          </button>
        </div>
      </section>
    );
  }

  const held = (rooms ?? []).filter(
    (r) => r.holder && address && r.holder.toLowerCase() === address.toLowerCase(),
  );

  return (
    <section className="panel" id="rights">
      <div className="panel__head">
        <h2>My room rights</h2>
        <span className="badge badge--quiet">Hedera testnet</span>
      </div>

      {failed && (
        <div className="panel__body">
          <p className="micro" style={{ color: "crimson" }}>
            ● Could not read rights from the registry.
          </p>
        </div>
      )}

      {!failed && rooms === null && (
        <div className="panel__body">
          <p className="dim micro">Reading your rights from Hedera…</p>
        </div>
      )}

      {!failed && rooms !== null && held.length === 0 && (
        <div className="panel__body">
          <p className="buy-panel__note">
            This wallet holds no room rights yet.
          </p>
          <Link href="/marketplace" className="btn btn--ghost">
            Browse rooms
          </Link>
        </div>
      )}

      {held.map((room) => (
        <div className="panel__body" key={room.listingId}>
          <div className="between" style={{ marginBottom: 12 }}>
            <div>
              <p className="eyebrow">Rights held</p>
              <h3 style={{ margin: "6px 0 0" }}>
                {formatDate(room.start.slice(0, 10))} –{" "}
                {formatDate(room.end.slice(0, 10))}
              </h3>
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="mono" style={{ fontSize: 20 }}>
                {Number(room.price).toLocaleString()} <small>dUSDC</small>
              </div>
              <span className="dim micro">paid once · no refunds</span>
            </div>
          </div>

          <div className="buy-panel__list">
            <div>
              <span>Listing</span>
              <span className="mono">#{room.listingId}</span>
            </div>
            <div>
              <span>Room tag</span>
              <span className="mono">{room.roomTag.slice(0, 16)}…</span>
            </div>
            <div>
              <span>Holder</span>
              <span className="mono">
                {room.holder?.slice(0, 6)}…{room.holder?.slice(-4)}
              </span>
            </div>
            <div>
              <span>State</span>
              <StatusStamp state={room.state as RoomState} />
            </div>
          </div>

          {room.state === "frozen" && (
            <p className="micro" style={{ color: "crimson", marginTop: 10 }}>
              ● The registrar has frozen this room. It cannot be relied on until
              the freeze is lifted.
            </p>
          )}

          <div className="form-actions" style={{ marginTop: 16 }}>
            <Link href={`/verify/rmo-3b-andheri?room=${room.listingId}`} className="btn">
              Prove I&apos;m the holder
            </Link>
            <Link href="/marketplace" className="btn btn--ghost">
              Find another room
            </Link>
          </div>
        </div>
      ))}
    </section>
  );
}
