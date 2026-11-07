"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PresenceCheck } from "@/components/verify/presence-check";
import { useLiveRooms, shortAddress } from "@/lib/chain/use-live-rooms";
import { QRPanel } from "@/components/ui/qr-panel";
import { StatusStamp } from "@/components/ui/status-stamp";
import { VerifyBadge } from "@/components/ui/verify-badge";
import {
  demo,
  formatDate,
  property,
  rooms as sampleRooms,
  type RoomState,
} from "@/lib/data";

type LiveState = "idle" | "verifying" | "match" | "mismatch";

const stateCopy: Record<RoomState, string> = {
  available: "Available",
  held: "Sold",
  frozen: "Frozen",
  expired: "Expired",
  cancelled: "Cancelled",
};

export function VerifyClient({
  initialRoom = "",
  initialState,
}: {
  initialRoom?: string;
  initialState?: RoomState;
}) {
  // Live rights from RentalRegistry on Hedera. Falls back to the sample set only when
  // the chain is unreachable or holds no listings -- and says which it is showing, so a
  // sample room can never be mistaken for a real one.
  const { rooms: liveRooms, status: liveStatus, rootVersion } = useLiveRooms();
  const rooms = liveRooms ?? sampleRooms;
  /** The holder actually recorded on-chain. Previously this rendered a hardcoded
   *  constant, so a real period and a real identity sat next to a fake wallet. */
  const [shareOrigin, setShareOrigin] = useState("https://rentmeout.xyz");
  useEffect(() => {
    setShareOrigin(window.location.origin);
  }, []);

  const isLive = liveStatus === "live";
  // Only the sample rooms may show the sample holder. A live room with no holder shows none.
  const holderShort = (r: { holder?: string }) =>
    r.holder ? shortAddress(r.holder) : isLive ? "—" : demo.brokerShort;


  // Kept as given even before the live rooms load: the door QR names a specific room, and
  // showing a tenant a different room's status would be worse than showing nothing.
  const [roomId, setRoomId] = useState(initialRoom);
  const [stateByRoom, setStateByRoom] = useState<Record<string, RoomState>>({
    r1: "available",
    r2: initialState ?? "held",
    r3: "available",
  });
  const [live, setLive] = useState<LiveState>("idle");
  /**
   * "live" runs the real two-QR session-proof check. "simulated" is the scripted
   * walkthrough, kept because the live path needs the World ID Sandbox app and an
   * on-chain holder, and the page must still demo while those land. The simulated
   * path is labelled as such wherever it is shown -- a fake green must never be
   * mistakable for a real one.
   */
  const [mode, setMode] = useState<"live" | "simulated">("live");
  const [checkedAt, setCheckedAt] = useState<string | null>(null);

  const room =
    rooms.find((entry) => entry.id === roomId) ?? rooms[Math.min(1, rooms.length - 1)];

  /** Describes the rooms actually on screen, not a fixed sample. */
  const periodLabel =
    liveStatus === "live" && rooms.length
      ? `${formatDate(rooms[0].validFrom)} – ${formatDate(rooms[rooms.length - 1].validUntil)}`
      : demo.periodLabel;

  /** The link a tenant scans at the door: this host, this room. */
  const shareUrl = `${shareOrigin}/verify/rmo-3b-andheri?room=${room.id}`;
  const roomIndex = rooms.findIndex((entry) => entry.id === room.id);
  const state = stateByRoom[room.id] ?? room.state;

  useEffect(() => {
    setLive("idle");
    setCheckedAt(null);
  }, [roomId, state]);

  useEffect(() => {
    if (liveRooms?.length && !liveRooms.some((r) => r.id === roomId)) {
      setRoomId(liveRooms[0].id);
    }
  }, [liveRooms, roomId]);

  useEffect(() => {
    if (live !== "verifying") return;
    const timer = window.setTimeout(() => {
      setLive("match");
      setCheckedAt(
        new Intl.DateTimeFormat("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }).format(new Date()),
      );
    }, 2100);
    return () => window.clearTimeout(timer);
  }, [live]);

  const status = useMemo(() => stateCopy[state], [state]);
  const held = state === "held";
  const canCheck = held && live !== "verifying";

  // Until the registry answers, show nothing about who holds what. Falling back to the
  // sample set here rendered a fabricated holder and root version as though they were
  // real rights -- the one claim this page exists to make truthfully.
  // Every hook above runs unconditionally, so this early return is safe.
  if (liveStatus === "loading") {
    return (
      <main className="verify-page">
        <header className="verify-head">
          <p className="verify-head__eyebrow">Public check · no account needed</p>
          <h1 className="verify-head__title">Verify a room</h1>
        </header>
        <section className="verify-panel">
          <p className="dim">Reading rights from Hedera testnet…</p>
        </section>
      </main>
    );
  }

  return (
    <>
      <header className="verify-head">
        <p className="eyebrow">Public check · no account needed</p>
        <h1>
          {isLive ? room.name : property.nickname}
          <br />
          <span style={{ color: "var(--graphite)" }}>
            {isLive
              ? (room.city ?? "City not indexed")
              : `${property.locality}, ${property.city}`}
          </span>
        </h1>
        <p>
          {periodLabel} · {rooms.length}{" "}
          {rooms.length === 1 ? "room" : "rooms"} · registrar-approved property. Read
          the current holder from Hedera, then check the person at the door.
        </p>
      </header>

      <section aria-labelledby="rooms-title" style={{ marginTop: 24 }}>
        <div className="between" style={{ marginBottom: 4 }}>
          <h2 id="rooms-title" className="subtitle">
            Rooms
          </h2>
          <span className="badge badge--verified">
            <span className="badge__check" aria-hidden="true">
              ✓
            </span>
            Property approved
          </span>
        </div>

        <p className="micro" style={{ marginBottom: 10 }}>
          {liveStatus === "live" ? (
            <span style={{ color: "green" }}>
              ● Live from Hedera testnet · RentalRegistry
            </span>
          ) : (
            <span style={{ color: "crimson" }}>
              ● Sample data — the registry is unreachable or holds no listings. These
              rooms are illustrative, not real rights.
            </span>
          )}
        </p>
        <div className="verify-room-list">
          {rooms.map((entry, index) => {
            const entryState =
              entry.id === room.id ? state : stateByRoom[entry.id];
            return (
              <button
                key={entry.id}
                type="button"
                className="verify-room"
                data-selected={entry.id === room.id}
                onClick={() => setRoomId(entry.id)}
                aria-pressed={entry.id === room.id}
              >
                <span className="verify-room__badge">R{index + 1}</span>
                <span style={{ textAlign: "left" }}>
                  <h3>{entry.name.split("·").slice(1).join("·").trim()}</h3>
                  <p>
                    {formatDate(entry.validFrom)} –{" "}
                    {formatDate(entry.validUntil)} ·{" "}
                    {entryState === "held"
                      ? `holder ${holderShort(entry)}`
                      : isLive
                        ? "no current holder"
                        : "one verified broker"}
                  </p>
                </span>
                <span className="verify-room__state">
                  <StatusStamp state={entryState} label={stateCopy[entryState]} />
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="verify-result" aria-labelledby="rights-title">
        <div className="verify-result__head">
          <h2 id="rights-title" className="subtitle">
            Current rights · Room {roomIndex + 1}
          </h2>
          <StatusStamp state={state} label={status} />
        </div>
        <div className="verify-result__body">
          {state === "held" && room.holder ? (
            <>
              <div className="verify-result__holder">
                <div>
                  <strong>Verified broker holds this room.</strong>
                  <span>
                    Holder wallet · <span className="mono">{holderShort(room)}</span>
                  </span>
                </div>
                {room.holderNullifier && (
                  <VerifyBadge
                    label="Matched"
                    hash={room.holderNullifier}
                  />
                )}
              </div>
              <div className="verify-result__checks">
                <div className="verify-check">
                  <span>Rights period</span>
                  <span>
                    {formatDate(room.validFrom)} →{" "}
                    {formatDate(room.validUntil)}
                  </span>
                </div>
                <div className="verify-check">
                  <span>Current holder · Hedera</span>
                  <span className="green">Confirmed on testnet</span>
                </div>
                <div className="verify-check">
                  <span>Property approval</span>
                  <span>
                    Registrar-approved · root v{rootVersion ?? demo.rootVersion}
                  </span>
                </div>
                <div className="verify-check">
                  <span>Token</span>
                  <span className="mono">
                    {room.tokenAddress ? (
                      <a
                        href={`https://hashscan.io/testnet/contract/${room.tokenAddress}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {room.tokenId}
                      </a>
                    ) : (
                      room.tokenId
                    )}
                  </span>
                </div>
                <div className="verify-check">
                  <span>Purchase transaction</span>
                  <span className="mono">
                    {room.transactionId ? (
                      <a
                        href={`https://hashscan.io/testnet/transaction/${room.transactionId}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {room.transactionId.slice(0, 16)}…
                      </a>
                    ) : (
                      "Not indexed yet"
                    )}
                  </span>
                </div>
              </div>
            </>
          ) : state === "frozen" ? (
            <>
              <div className="verify-warning">
                <strong>Frozen — under review.</strong> The registrar has paused
                this room right during a dispute. Do not rely on the broker&apos;s
                claim until the freeze is lifted.
              </div>
              <div className="verify-result__checks" style={{ marginTop: 16 }}>
                <div className="verify-check">
                  <span>Holder on record</span>
                  <span className="mono">{holderShort(room)}</span>
                </div>
                <div className="verify-check">
                  <span>Rights period</span>
                  <span>
                    {formatDate(room.validFrom)} →{" "}
                    {formatDate(room.validUntil)}
                  </span>
                </div>
                <div className="verify-check">
                  <span>Freeze transaction</span>
                  <span className="mono">0.0.5941282@1779…</span>
                </div>
              </div>
            </>
          ) : state === "expired" ? (
            <>
              <div className="verify-warning">
                <strong>Expired — no current valid holder.</strong> The rights
                period has ended, so nobody holds this room. Do not pay an
                advance on this listing.
              </div>
              <div className="verify-result__checks" style={{ marginTop: 16 }}>
                <div className="verify-check">
                  <span>Last valid date</span>
                  <span>{formatDate(room.validUntil)}</span>
                </div>
                <div className="verify-check">
                  <span>Token state</span>
                  <span>Burned</span>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="verify-result__holder">
                <div>
                  <strong>No broker holds this room yet.</strong>
                  <span>It is available for the listed period.</span>
                </div>
                <StatusStamp state="available" />
              </div>
              <div className="verify-result__checks">
                <div className="verify-check">
                  <span>Rights period</span>
                  <span>
                    {formatDate(room.validFrom)} →{" "}
                    {formatDate(room.validUntil)}
                  </span>
                </div>
                <div className="verify-check">
                  <span>One-time price</span>
                  <span>{room.price} USDC</span>
                </div>
                <div className="verify-check">
                  <span>Property approval</span>
                  <span>Registrar-approved · root v{rootVersion ?? demo.rootVersion}</span>
                </div>
              </div>
            </>
          )}
        </div>
      </section>

      {isLive && room.latitude !== undefined && room.longitude !== undefined && (
        <section className="verify-result" aria-labelledby="property-location-title" style={{ marginTop: 18 }}>
          <div className="verify-result__head">
            <h2 id="property-location-title" className="subtitle">Property location · Hedera</h2>
            <span className="badge badge--verified">Listing coordinates</span>
          </div>
          <div className="verify-result__body">
            <p className="micro dim" style={{ marginBottom: 12 }}>
              This map uses the coordinates permanently recorded with the listing. The pin was owner-supplied and reviewed with the deed; it is not an independent survey.
            </p>
            <iframe
              title="On-chain property coordinates"
              src={`https://www.openstreetmap.org/export/embed.html?bbox=${room.longitude - 0.008}%2C${room.latitude - 0.008}%2C${room.longitude + 0.008}%2C${room.latitude + 0.008}&layer=mapnik&marker=${room.latitude}%2C${room.longitude}`}
              loading="lazy"
              referrerPolicy="no-referrer"
              style={{ width: "100%", height: 280, border: "1px solid var(--line)", borderRadius: 8 }}
            />
            <p className="mono micro" style={{ marginTop: 8 }}>
              {room.latitude.toFixed(6)}, {room.longitude.toFixed(6)}
            </p>
          </div>
        </section>
      )}
      {isLive && room.legacyRegistry && room.latitude === undefined && (
        <div className="notice notice--brass" style={{ marginTop: 18 }}>
          <span className="notice__icon" aria-hidden="true">i</span>
          <div>
            <strong>This legacy listing has no on-chain location coordinates.</strong>
            <p>Verify the property in person and compare the room token and holder against the original registry record.</p>
          </div>
        </div>
      )}

      {held && (
        <div className="verify-action">
          {mode === "live" ? (
            <>
              <PresenceCheck roomId={room.id} />
              <p className="micro dim" style={{ marginTop: 12 }}>
                The broker scans the code on their own device and completes a fresh
                World ID session proof. The result comes back signed by the server, so
                they cannot fake it by showing you their screen.{" "}
                <button
                  type="button"
                  className="linklike"
                  onClick={() => {
                    setMode("simulated");
                    setLive("idle");
                    setCheckedAt(null);
                  }}
                >
                  Show the scripted walkthrough instead
                </button>
              </p>
            </>
          ) : (
            <>
          {live === "idle" && (
            <>
              <button
                type="button"
                className="btn btn--wide"
                onClick={() => setLive("verifying")}
                disabled={!canCheck}
              >
                Verify this broker in person
              </button>
              <p>
                Starts a short-lived viewing session. The broker completes a
                fresh World ID check on their device.
              </p>
            </>
          )}

          {(live === "verifying" || live === "match" || live === "mismatch") && (
            <div className="live-check" data-result={live === "verifying" ? undefined : live}>
              <div className="live-check__head">
                <span className="micro dim">Viewing session · VW-4821</span>
                <span className="badge badge--quiet">Room {roomIndex + 1}</span>
              </div>
              <div className="live-check__body">
                {live === "verifying" && (
                  <>
                    <div
                      className="live-check__result"
                      aria-hidden="true"
                      style={{ borderColor: "var(--line-strong)" }}
                    >
                      <span className="spinner" />
                    </div>
                    <h2>Waiting for the broker</h2>
                    <p>
                      The broker is completing a fresh World ID presence check.
                      The result is compared with the holder wallet on Hedera.
                    </p>
                    <div className="demo-states" style={{ marginTop: 18 }}>
                      <span className="demo-states__label">Demo result</span>
                      <button
                        type="button"
                        className="demo-chip"
                        onClick={() => {
                          setLive("match");
                          setCheckedAt(
                            new Intl.DateTimeFormat("en-IN", {
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit",
                            }).format(new Date()),
                          );
                        }}
                      >
                        Green match
                      </button>
                      <button
                        type="button"
                        className="demo-chip"
                        onClick={() => {
                          setLive("mismatch");
                          setCheckedAt(
                            new Intl.DateTimeFormat("en-IN", {
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit",
                            }).format(new Date()),
                          );
                        }}
                      >
                        Red mismatch
                      </button>
                    </div>
                  </>
                )}

                {live === "match" && (
                  <>
                    <div className="live-check__result" aria-hidden="true">
                      ✓
                    </div>
                    <h2>This is the verified broker.</h2>
                    <p>
                      The person present completed a fresh check and matches the
                      wallet that holds Room {roomIndex + 1}. Rights are valid
                      through {formatDate(room.validUntil)}.
                    </p>
                    <div className="live-check__meta">
                      <span className="mono">{holderShort(room)}</span>
                      <span className="mono">{room.holderNullifier ?? demo.nullifierShort}</span>
                      <span>checked {checkedAt}</span>
                    </div>
                    <button
                      type="button"
                      className="btn btn--ghost btn--small"
                      style={{ marginTop: 18 }}
                      onClick={() => {
                        setLive("idle");
                        setCheckedAt(null);
                      }}
                    >
                      Run the check again
                    </button>
                  </>
                )}

                {live === "mismatch" && (
                  <>
                    <div className="live-check__result" aria-hidden="true">
                      ×
                    </div>
                    <h2>This is not the rights holder.</h2>
                    <p>
                      The fresh check did not match the wallet that holds Room{" "}
                      {roomIndex + 1}. Do not rely on this broker&apos;s claim or
                      pay an advance.
                    </p>
                    <div className="live-check__meta">
                      <span>session VW-4821 ended</span>
                      <span>checked {checkedAt}</span>
                    </div>
                    <button
                      type="button"
                      className="btn btn--ghost btn--small"
                      style={{ marginTop: 18 }}
                      onClick={() => {
                        setLive("idle");
                        setCheckedAt(null);
                      }}
                    >
                      Start over
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

              <p className="micro dim" style={{ marginTop: 12 }}>
                Scripted walkthrough — these results are illustrative, not a real
                proof.{" "}
                <button
                  type="button"
                  className="linklike"
                  onClick={() => {
                    setMode("live");
                    setLive("idle");
                    setCheckedAt(null);
                  }}
                >
                  Back to the live check
                </button>
              </p>
            </>
          )}
        </div>
      )}

      {!held && (
        <div className="verify-action">
          <button type="button" className="btn btn--wide" disabled>
            No current broker to verify
          </button>
          <p>
            Only a sold, valid room has a current holder to match at the door.
          </p>
        </div>
      )}

      <section className="mt-32">
        <QRPanel value={shareUrl} title={`${room.name} · verification link`} />
      </section>

      <div className="demo-states">
        <span className="demo-states__label">Demo states · {room.name}</span>
        {(["available", "held", "frozen", "expired"] as RoomState[]).map(
          (demoState) => (
            <button
              key={demoState}
              type="button"
              className="demo-chip"
              data-active={roomId === "r2" && state === demoState}
              onClick={() => {
                setRoomId("r2");
                setStateByRoom((current) => ({ ...current, r2: demoState }));
              }}
            >
              {stateCopy[demoState]}
            </button>
          ),
        )}
      </div>

      <p className="verify-footnote">
        This page is public and needs no account. Arkiv supplies the discovery
        record; Hedera is authoritative for the current holder, freeze and
        expiry. The green result compares a fresh World ID presence check with
        the holder binding on the server. It never displays a face or ID
        document. Property approval and broker match are separate checks.
      </p>

      <div className="between wrap mt-24">
        <Link href="/marketplace" className="text-link">
          Browse other rooms
        </Link>
        <span className="mono dim" style={{ fontSize: 10 }}>
          {isLive ? (room.arkivKey ? `Arkiv ${room.arkivKey.slice(0, 18)}…` : "") : demo.purchaseTx}
        </span>
      </div>
    </>
  );
}
