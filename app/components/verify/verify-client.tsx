"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { QRPanel } from "@/components/ui/qr-panel";
import { StatusStamp } from "@/components/ui/status-stamp";
import { VerifyBadge } from "@/components/ui/verify-badge";
import {
  demo,
  formatDate,
  property,
  rooms,
  type RoomState,
} from "@/lib/data";

type LiveState = "idle" | "verifying" | "match" | "mismatch";

const stateCopy: Record<RoomState, string> = {
  available: "Available",
  held: "Sold",
  frozen: "Frozen",
  expired: "Expired",
};

export function VerifyClient({
  initialRoom = "r2",
  initialState,
}: {
  initialRoom?: string;
  initialState?: RoomState;
}) {
  const [roomId, setRoomId] = useState(
    rooms.some((room) => room.id === initialRoom) ? initialRoom : "r2",
  );
  const [stateByRoom, setStateByRoom] = useState<Record<string, RoomState>>({
    r1: "available",
    r2: initialState ?? "held",
    r3: "available",
  });
  const [live, setLive] = useState<LiveState>("idle");
  const [checkedAt, setCheckedAt] = useState<string | null>(null);

  const room = rooms.find((entry) => entry.id === roomId) ?? rooms[1];
  const roomIndex = rooms.findIndex((entry) => entry.id === room.id);
  const state = stateByRoom[room.id] ?? room.state;

  useEffect(() => {
    setLive("idle");
    setCheckedAt(null);
  }, [roomId, state]);

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

  return (
    <>
      <header className="verify-head">
        <p className="eyebrow">Public check · no account needed</p>
        <h1>
          {property.nickname}
          <br />
          <span style={{ color: "var(--graphite)" }}>
            {property.locality}, {property.city}
          </span>
        </h1>
        <p>
          {demo.periodLabel} · three rooms · registrar-approved property. Read
          the current holder from Hedera, then check the person at the door.
        </p>
      </header>

      <section aria-labelledby="rooms-title" style={{ marginTop: 24 }}>
        <div className="between" style={{ marginBottom: 4 }}>
          <h2 id="rooms-title" className="subtitle">
            Rooms in this flat
          </h2>
          <span className="badge badge--verified">
            <span className="badge__check" aria-hidden="true">
              ✓
            </span>
            Property approved
          </span>
        </div>

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
                      ? `holder ${demo.brokerShort}`
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
                    Holder wallet · <span className="mono">{demo.brokerShort}</span>
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
                    Registrar-approved · root v{demo.rootVersion}
                  </span>
                </div>
                <div className="verify-check">
                  <span>Token</span>
                  <span className="mono">{room.tokenId}</span>
                </div>
                <div className="verify-check">
                  <span>Purchase transaction</span>
                  <span className="mono">
                    {room.transactionId?.slice(0, 16)}…
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
                  <span className="mono">{demo.brokerShort}</span>
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
                period has ended and the token has been burned. Do not pay an
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
                  <span>Registrar-approved · root v{demo.rootVersion}</span>
                </div>
              </div>
            </>
          )}
        </div>
      </section>

      {held && (
        <div className="verify-action">
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
                      <span className="mono">{demo.brokerShort}</span>
                      <span className="mono">{demo.nullifierShort}</span>
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
        <QRPanel value="https://rentmeout.xyz/verify/rmo-3b-andheri?room=r2" />
      </section>

      <div className="demo-states">
        <span className="demo-states__label">Demo states · Room 2</span>
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
          {demo.purchaseTx}
        </span>
      </div>
    </>
  );
}
