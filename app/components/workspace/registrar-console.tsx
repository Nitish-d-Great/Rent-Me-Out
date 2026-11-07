"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApprovalBadge, StatusStamp } from "@/components/ui/status-stamp";
import { formatDate, type RoomState } from "@/lib/data";
import { useLiveRooms } from "@/lib/chain/use-live-rooms";
import type { OwnerApplication } from "@/lib/chain/use-owner";

type AuditEntry = {
  id: string;
  action: string;
  target: string;
  actor: string;
  reason: string;
  time: string;
  tx: string;
};

const TOKEN_KEY = "rmo.registrar.token";

/** Sent with every call that spends the registrar key or reads private details. */
function registrarHeaders(token: string): Record<string, string> {
  return {
    "content-type": "application/json",
    ...(token ? { "x-registrar-token": token } : {}),
  };
}

/** Decisions already on the chain, so the log survives a page reload. */
function decisionsToAudit(apps: OwnerApplication[]): AuditEntry[] {
  return apps
    .filter((app) => app.status !== "pending" && app.transactionHash)
    .map((app) => ({
      id: `decision-${app.applicationId}`,
      action: app.status === "approved" ? "Property approved" : "Property rejected",
      target: `${app.applicationId} · ${app.nickname}`,
      actor: "Registrar",
      reason: app.reason ?? "Deed verified",
      time: new Date(app.decidedAt ?? app.submittedAt).toLocaleString("en-GB"),
      tx: app.transactionHash ?? "",
    }));
}

export function RegistrarConsole() {
  // Live listings from RentalRegistry. Freezing acts on these ids, so the console must
  // not offer sample rooms that have no on-chain counterpart.
  const { rooms: liveRooms, status: liveStatus } = useLiveRooms();
  const rooms = liveRooms ?? [];
  const [freezeTx, setFreezeTx] = useState<string | null>(null);
  const [decisionTx, setDecisionTx] = useState<string | null>(null);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [freezeError, setFreezeError] = useState<string | null>(null);
  const [freezing, setFreezing] = useState<string | null>(null);
  const [sweeping, setSweeping] = useState(false);
  const [sweepNote, setSweepNote] = useState<string | null>(null);

  const [apps, setApps] = useState<OwnerApplication[]>([]);
  const [appsState, setAppsState] = useState<"loading" | "ready" | "locked" | "unavailable">("loading");
  const appsRequestInFlight = useRef(false);
  const [token, setToken] = useState("");
  const [tokenDraft, setTokenDraft] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [locationConfirmedId, setLocationConfirmedId] = useState<string | null>(null);
  const [rejection, setRejection] = useState("");
  const [processing, setProcessing] = useState<"approve" | "reject" | null>(
    null,
  );
  // Only holds a state the registrar just changed, until the next read from the chain.
  const [roomStates, setRoomStates] = useState<Record<string, RoomState>>({});
  const [freezeTarget, setFreezeTarget] = useState<string | null>(null);
  const [freezeReason, setFreezeReason] = useState("");
  const [sessionAudit, setSessionAudit] = useState<AuditEntry[]>([]);
  const audit = [...sessionAudit, ...decisionsToAudit(apps)];

  const selected = apps.find((app) => app.applicationId === selectedId) ?? apps[0];
  const locationConfirmed = selected?.applicationId === locationConfirmedId;

  /** The review queue: status from Arkiv, details decrypted from Swarm by the server. */
  const loadApplications = useCallback(async (accessToken: string) => {
    if (appsRequestInFlight.current) return;
    appsRequestInFlight.current = true;
    try {
      const res = await fetch("/api/properties", { headers: registrarHeaders(accessToken) });
      if (res.status === 401) {
        setAppsState("locked");
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { applications: OwnerApplication[] };
      setApps(data.applications);
      setAppsState("ready");
    } catch {
      setAppsState("unavailable");
    } finally {
      appsRequestInFlight.current = false;
    }
  }, []);

  useEffect(() => {
    void (async () => {
      const stored = window.sessionStorage.getItem(TOKEN_KEY) ?? "";
      setToken(stored);
      await loadApplications(stored);
    })();
  }, [loadApplications]);

  // Keep an already-open registrar console in sync when an owner submits elsewhere.
  // Arkiv indexing is asynchronous, so poll gently and also offer an immediate refresh.
  useEffect(() => {
    if (appsState === "locked") return;
    const refresh = () => {
      if (document.visibilityState === "visible") void loadApplications(token);
    };
    const interval = window.setInterval(refresh, 15_000);
    return () => window.clearInterval(interval);
  }, [appsState, loadApplications, token]);

  const unlock = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = tokenDraft.trim();
    window.sessionStorage.setItem(TOKEN_KEY, value);
    setToken(value);
    setTokenDraft("");
    setAppsState("loading");
    await loadApplications(value);
  };

  /** Opens the decrypted deed. Fetched rather than linked, so the token stays in a header. */
  const openDeed = async (applicationId: string) => {
    setDecisionError(null);
    try {
      const res = await fetch(`/api/properties/${encodeURIComponent(applicationId)}/deed`, {
        headers: registrarHeaders(token),
      });
      if (!res.ok) throw new Error(String(res.status));
      window.open(URL.createObjectURL(await res.blob()), "_blank", "noopener");
    } catch {
      setDecisionError("The deed could not be read from Swarm.");
    }
  };

  const pushAudit = (action: string, target: string, reason: string, tx: string) => {
    setSessionAudit((current) => [
      {
        id: `audit-${Date.now()}`,
        action,
        target,
        actor: "Registrar",
        reason,
        time: new Date().toLocaleString("en-GB"),
        tx,
      },
      ...current,
    ]);
  };

  /**
   * The registrar's decision, written to Hedera.
   *
   * Approving admits the owner's Semaphore commitment to the approved set, which is
   * what later lets them prove a property is approved without revealing which one.
   * Local state only changes once the transaction has actually succeeded.
   */
  const decide = async (decision: "approved" | "rejected") => {
    if (!selected || selected.status !== "pending") return;
    if (decision === "approved" && (!locationConfirmed || selected.latitudeE6 === undefined || selected.longitudeE6 === undefined)) return;
    if (decision === "rejected" && !rejection.trim()) return;

    setProcessing(decision === "approved" ? "approve" : "reject");
    setDecisionError(null);
    setDecisionTx(null);
    try {
      const res = await fetch("/api/properties", {
        method: "POST",
        headers: registrarHeaders(token),
        body: JSON.stringify({
          action: decision === "approved" ? "approve" : "reject",
          applicationId: selected.applicationId,
          locationReviewConfirmed: decision === "approved" ? locationConfirmed : undefined,
          reason: decision === "rejected" ? rejection.trim() : undefined,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean; error?: string; transactionHash?: string;
      };
      if (!res.ok || !data.ok) {
        setDecisionError(
          data.error === "commitment_required"
            ? "This application has no owner commitment on file, so there is nothing to admit to the approved set."
            : (data.error ?? "decision_failed"),
        );
        return;
      }

      setDecisionTx(data.transactionHash ?? null);
      await loadApplications(token);
      setRejection("");
    } catch {
      setDecisionError("network_error");
    } finally {
      setProcessing(null);
    }
  };

  const pending = apps.filter((app) => app.status === "pending").length;
  const roomList = rooms.map((room, index) => ({
    ...room,
    index,
    // The chain is authoritative: an optimistic local state is only used while a
    // transaction is in flight.
    state: roomStates[room.id] ?? room.state,
  }));

  /**
   * Freeze or unfreeze on-chain, signed by the registrar on the server.
   * Local state is only updated once the transaction has actually succeeded.
   */
  const runLifecycle = async (
    listingId: string,
    action: "cancel" | "expire",
    label: string,
  ) => {
    setFreezing(listingId);
    setFreezeError(null);
    setFreezeTx(null);
    try {
      const res = await fetch(`/api/rooms/${listingId}/lifecycle`, {
        method: "POST",
        headers: registrarHeaders(token),
        body: JSON.stringify({ action }),
      });
      const data = (await res.json()) as {
        ok?: boolean; error?: string; state?: string | null; transactionHash?: string;
      };
      if (!res.ok || !data.ok) {
        setFreezeError(
          data.error === "already_sold"
            ? "This room has been sold, so it can no longer be cancelled."
            : data.error === "not_yet_expired"
              ? "This listing's period has not ended yet."
              : (data.error ?? "lifecycle_failed"),
        );
        return;
      }
      setRoomStates((prev) => ({
        ...prev,
        [listingId]: (data.state as RoomState) ?? "expired",
      }));
      setFreezeTx(data.transactionHash ?? null);
      pushAudit(
        action === "cancel" ? "Listing cancelled" : "Room expired",
        label,
        action === "cancel" ? "Withdrawn before sale" : "Period ended · token burned",
        data.transactionHash ?? "",
      );
    } catch {
      setFreezeError("network_error");
    } finally {
      setFreezing(null);
    }
  };

  /** Expires every listing whose period has ended. Safe to run when none are due. */
  const runSweep = async () => {
    setSweeping(true);
    setFreezeError(null);
    setFreezeTx(null);
    try {
      const res = await fetch("/api/rooms/sweep", { method: "POST" });
      const data = (await res.json()) as {
        ok?: boolean; error?: string; expired?: string[]; transactionHash?: string;
      };
      if (!res.ok || !data.ok) {
        setFreezeError(data.error ?? "sweep_failed");
        return;
      }
      if (!data.expired?.length) {
        setSweepNote("No listings are due to expire.");
        return;
      }
      setFreezeTx(data.transactionHash ?? null);
      setSweepNote(`Expired ${data.expired.length} listing(s): ${data.expired.join(", ")}`);
      pushAudit(
        "Expiry sweep",
        `${data.expired.length} listing(s)`,
        "Period ended · tokens burned",
        data.transactionHash ?? "",
      );
    } catch {
      setFreezeError("network_error");
    } finally {
      setSweeping(false);
    }
  };

  const runFreeze = async (
    listingId: string,
    action: "freeze" | "unfreeze",
    reason: string,
    label: string,
  ) => {
    setFreezing(listingId);
    setFreezeError(null);
    setFreezeTx(null);
    try {
      const res = await fetch(`/api/rooms/${listingId}/freeze`, {
        method: "POST",
        headers: registrarHeaders(token),
        body: JSON.stringify({ action, reason }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        state?: string | null;
        transactionHash?: string;
      };
      if (!res.ok || !data.ok) {
        setFreezeError(data.error ?? "freeze_failed");
        return;
      }
      setRoomStates((prev) => ({
        ...prev,
        [listingId]: (data.state as RoomState) ?? (action === "freeze" ? "frozen" : "held"),
      }));
      setFreezeTx(data.transactionHash ?? null);
      pushAudit(
        action === "freeze" ? "Room frozen" : "Room unfrozen",
        label,
        reason,
        data.transactionHash ?? "",
      );
    } catch {
      setFreezeError("network_error");
    } finally {
      setFreezing(null);
    }
  };

  return (
    <>
      <div className="metric-row">
        <div className="metric">
          <div className="metric__label">Pending applications</div>
          <div className="metric__value">{pending}</div>
        </div>
        <div className="metric">
          <div className="metric__label">Approved</div>
          <div className="metric__value">
            {apps.filter((app) => app.status === "approved").length}
          </div>
        </div>
        <div className="metric">
          <div className="metric__label">Rooms under dispute</div>
          <div className="metric__value">
            {
              Object.values(roomStates).filter((state) => state === "frozen")
                .length
            }
          </div>
        </div>
        <div className="metric">
          <div className="metric__label">Audit entries</div>
          <div className="metric__value">{audit.length}</div>
        </div>
      </div>

      <div className="registrar-grid">
        <aside className="panel">
          <div className="panel__head">
            <h2>Review queue</h2>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span className="badge badge--brass">{pending} pending</span>
              <button
                type="button"
                className="btn btn--small"
                onClick={() => void loadApplications(token)}
                aria-label="Refresh property applications"
              >
                Refresh
              </button>
            </div>
          </div>
          <div className="queue-list">
            {appsState === "loading" && (
              <p className="micro dim" style={{ padding: 18 }}>Reading the queue from Arkiv…</p>
            )}
            {appsState === "unavailable" && (
              <p className="micro" style={{ padding: 18, color: "crimson" }}>
                ● The queue could not be read from Arkiv.
              </p>
            )}
            {appsState === "locked" && (
              <form onSubmit={(event) => void unlock(event)} style={{ padding: 18 }}>
                <div className="field">
                  <label htmlFor="registrar-token">Registrar access token</label>
                  <input
                    id="registrar-token"
                    type="password"
                    value={tokenDraft}
                    onChange={(event) => setTokenDraft(event.target.value)}
                  />
                </div>
                <button type="submit" className="btn btn--small" style={{ marginTop: 10 }}>
                  Unlock
                </button>
              </form>
            )}
            {appsState === "ready" && apps.length === 0 && (
              <p className="micro dim" style={{ padding: 18 }}>
                No applications yet. They appear here when an owner submits a property.
              </p>
            )}
            {apps.map((app) => (
              <button
                key={app.applicationId}
                type="button"
                className="queue-item"
                data-selected={app.applicationId === selected?.applicationId}
                onClick={() => {
                  setSelectedId(app.applicationId);
                  setRejection("");
                  setDecisionTx(null);
                  setDecisionError(null);
                }}
              >
                <span className="queue-item__id mono">{app.applicationId}</span>
                <strong>{app.nickname}</strong>
                <span className="queue-item__meta">
                  {app.locality} · {app.rooms} rooms ·{" "}
                  {formatDate(app.submittedAt.slice(0, 10))}
                </span>
                <span style={{ marginTop: 8 }}>
                  <ApprovalBadge state={app.status} />
                </span>
              </button>
            ))}
          </div>
        </aside>

        {selected ? (
        <section className="panel">
          <div className="panel__head">
            <div>
              <h2>{selected.nickname}</h2>
              <span className="micro dim">
                {selected.applicationId} · submitted{" "}
                {formatDate(selected.submittedAt.slice(0, 10))}
              </span>
            </div>
            <ApprovalBadge state={selected.status} />
          </div>

          <div className="deed-review">
            <div className="deed-viewer">
              <div className="deed-viewer__bar">
                <span className="mono">{selected.deedName}</span>
                <span className="badge badge--alert">Registrar-only decrypt</span>
              </div>
              <div className="deed-viewer__paper">
                <span className="micro dim">Encrypted on Swarm</span>
                <h3>Deed · {selected.nickname}</h3>
                <p className="small dim" style={{ marginTop: 10 }}>
                  The deed is stored as ciphertext and is decrypted only for this review.
                </p>
                <button
                  type="button"
                  className="btn btn--small"
                  style={{ marginTop: 14 }}
                  onClick={() => void openDeed(selected.applicationId)}
                >
                  Open deed
                </button>
              </div>
            </div>

            <div className="deed-side">
              <p className="eyebrow">Property</p>
              <p className="small dim" style={{ marginTop: 8, marginBottom: 10 }}>
                Owner-selected pin · verify it against the deed before approving.
              </p>
              {selected.latitudeE6 !== undefined && selected.longitudeE6 !== undefined ? (
                <>
                  <iframe
                    title={`Application ${selected.applicationId} property map`}
                    src={`https://www.openstreetmap.org/export/embed.html?bbox=${selected.longitudeE6 / 1_000_000 - 0.008}%2C${selected.latitudeE6 / 1_000_000 - 0.008}%2C${selected.longitudeE6 / 1_000_000 + 0.008}%2C${selected.latitudeE6 / 1_000_000 + 0.008}&layer=mapnik&marker=${selected.latitudeE6 / 1_000_000}%2C${selected.longitudeE6 / 1_000_000}`}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    style={{ width: "100%", height: 220, border: "1px solid var(--line)", borderRadius: 8 }}
                  />
                  <p className="mono micro" style={{ marginTop: 6 }}>
                    {(selected.latitudeE6 / 1_000_000).toFixed(6)}, {(selected.longitudeE6 / 1_000_000).toFixed(6)}
                  </p>
                </>
              ) : (
                <p className="notice notice--alert">Legacy application has no location pin. Do not approve a location-based listing from it.</p>
              )}
              <div className="buy-panel__list" style={{ marginTop: 12 }}>
                <div>
                  <span>Locality</span>
                  <span>
                    {selected.locality}, {selected.city}
                  </span>
                </div>
                <div>
                  <span>Rooms requested</span>
                  <span>{selected.rooms}</span>
                </div>
                <div>
                  <span>Commitment</span>
                  <span className="mono">
                    {selected.commitment.slice(0, 8)}…{selected.commitment.slice(-6)}
                  </span>
                </div>
              </div>

              {selected.status === "pending" ? (
                <div style={{ marginTop: 18 }}>
                  <div className="field">
                    {(decisionTx || decisionError) && (
                      <p className="micro" style={{ marginBottom: 10 }}>
                        {decisionTx ? (
                          <>
                            <span style={{ color: "green" }}>
                              ● Recorded on Hedera testnet
                            </span>{" "}
                            —{" "}
                            <a
                              href={`https://hashscan.io/testnet/transaction/${decisionTx}`}
                              target="_blank"
                              rel="noreferrer"
                              className="mono"
                            >
                              {decisionTx.slice(0, 18)}…
                            </a>
                          </>
                        ) : (
                          <span style={{ color: "crimson" }}>
                            ● {decisionError} — nothing changed on-chain.
                          </span>
                        )}
                      </p>
                    )}
                    <label htmlFor="rejection">
                      Rejection reason · required to reject
                    </label>
                    <textarea
                      id="rejection"
                      value={rejection}
                      onChange={(event) => setRejection(event.target.value)}
                      placeholder="Write the reason the owner will see, e.g. page 3 is unreadable."
                    />
                  </div>
                  {selected.latitudeE6 !== undefined && selected.longitudeE6 !== undefined ? (
                    <label className="choice" style={{ marginTop: 14 }}>
                      <input
                        type="checkbox"
                        checked={locationConfirmed}
                        onChange={(event) => setLocationConfirmedId(event.target.checked ? selected.applicationId : null)}
                      />
                      I checked that the submitted map pin matches the property shown in the deed.
                    </label>
                  ) : (
                    <p className="micro" style={{ color: "crimson", marginTop: 12 }}>
                      This legacy application has no coordinates and cannot be approved for location-backed listings.
                    </p>
                  )}
                  <div className="flex wrap gap-8" style={{ marginTop: 12 }}>
                    <button
                      type="button"
                      className="btn btn--verified btn--small"
                      onClick={() => void decide("approved")}
                      disabled={processing !== null || !locationConfirmed || selected.latitudeE6 === undefined || selected.longitudeE6 === undefined}
                    >
                      {processing === "approve"
                        ? "Registering on Hedera…"
                        : "Approve property"}
                    </button>
                    <button
                      type="button"
                      className="btn btn--alert btn--small"
                      onClick={() => void decide("rejected")}
                      disabled={!rejection.trim() || processing !== null}
                    >
                      {processing === "reject"
                        ? "Recording rejection…"
                        : "Reject with reason"}
                    </button>
                  </div>
                  <p className="form-actions__note" style={{ marginTop: 10 }}>
                    Approval registers the opaque property commitment and updates
                    the approved-set root. Rejection writes the reason and mints
                    no tokens.
                  </p>
                </div>
              ) : (
                <div
                  className={`notice ${
                    selected.status === "approved"
                      ? "notice--verified"
                      : "notice--alert"
                  }`}
                  style={{ marginTop: 18 }}
                >
                  <span className="notice__icon" aria-hidden="true">
                    {selected.status === "approved" ? "✓" : "!"}
                  </span>
                  <div>
                    <strong>
                      {selected.status === "approved"
                        ? "Property approved on Hedera."
                        : "Application rejected."}
                    </strong>
                    <p>
                      {selected.status === "approved"
                        ? "The owner can now create one room token per room."
                        : selected.reason}
                    </p>
                    {selected.transactionHash && (
                      <a
                        href={`https://hashscan.io/testnet/transaction/${selected.transactionHash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="mono micro"
                      >
                        {selected.transactionHash.slice(0, 18)}…
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
        ) : (
          <section className="panel panel--pad">
            <p className="small dim">Select an application to review it.</p>
          </section>
        )}
      </div>

      <section className="panel" id="properties" style={{ marginTop: 24 }}>
        <div className="panel__head">
          <h2>Rooms + dispute controls</h2>
          <button
            type="button"
            className="btn btn--ghost btn--small"
            disabled={sweeping || liveStatus !== "live"}
            onClick={() => void runSweep()}
          >
            {sweeping ? "Running expiry sweep…" : "Run expiry sweep"}
          </button>
          <span className="micro">
            {liveStatus === "live" ? (
              <span style={{ color: "green" }}>● Live · RentalRegistry</span>
            ) : liveStatus === "loading" ? (
              <span className="dim">Reading listings…</span>
            ) : (
              <span className="dim">
                {liveStatus === "empty" ? "No listings yet" : "Registry unreachable"}
              </span>
            )}
          </span>
        </div>
        <div className="panel__body panel__body--flush">
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Room</th>
                  <th>Token</th>
                  <th>Holder</th>
                  <th>Period</th>
                  <th>State</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {liveStatus !== "live" && (
                  <tr>
                    <td colSpan={6} className="dim micro">
                      {liveStatus === "loading"
                        ? "Reading listings from Hedera…"
                        : liveStatus === "empty"
                          ? "No rooms have been listed on this registry yet."
                          : "The registry is unreachable, so no listings can be shown."}
                    </td>
                  </tr>
                )}
                {liveStatus === "live" &&
                  roomList.map((room) => (
                  <tr key={room.id}>
                    <td>
                      <strong>Room {room.index + 1}</strong>
                      <div className="dim" style={{ fontSize: 10 }}>
                        {room.name.split("·")[1]?.trim()}
                      </div>
                    </td>
                    <td className="mono">{room.tokenId}</td>
                    <td className="mono">
                      {(room.state === "held" || room.state === "frozen") &&
                      room.holder
                        ? `${room.holder.slice(0, 6)}…${room.holder.slice(-4)}`
                        : "—"}
                    </td>
                    <td>
                      {formatDate(room.validFrom)} – {formatDate(room.validUntil)}
                    </td>
                    <td>
                      <StatusStamp state={room.state} />
                    </td>
                    <td>
                      {room.legacyRegistry ? (
                        <span className="dim" style={{ fontSize: 10.5 }}>
                          Retained registry · view only
                        </span>
                      ) : room.state === "frozen" ? (
                        <button
                          type="button"
                          className="btn btn--ghost btn--small"
                          disabled={freezing === room.id || liveStatus !== "live"}
                          onClick={() =>
                            void runFreeze(
                              room.id,
                              "unfreeze",
                              "Dispute resolved",
                              room.name,
                            )
                          }
                        >
                          {freezing === room.id ? "Unfreezing…" : "Unfreeze"}
                        </button>
                      ) : room.state === "held" ? (
                        <button
                          type="button"
                          className="btn btn--alert btn--small"
                          onClick={() => {
                            setFreezeTarget(room.id);
                            setFreezeReason("");
                          }}
                        >
                          Freeze
                        </button>
                      ) : room.state === "available" ? (
                        <button
                          type="button"
                          className="btn btn--ghost btn--small"
                          disabled={freezing === room.id || liveStatus !== "live"}
                          onClick={() =>
                            void runLifecycle(
                              room.id,
                              "cancel",
                              room.name,
                            )
                          }
                        >
                          {freezing === room.id ? "Cancelling…" : "Cancel listing"}
                        </button>
                      ) : room.state === "cancelled" ? (
                        <span className="dim" style={{ fontSize: 10.5 }}>
                          Token burned
                        </span>
                      ) : room.state === "expired" ? (
                        // Ended rooms read as expired before the sweep has burned the token.
                        <span className="dim" style={{ fontSize: 10.5 }}>
                          Period ended
                        </span>
                      ) : (
                        <span className="dim" style={{ fontSize: 10.5 }}>
                          No held right
                        </span>
                      )}
                    </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          {sweepNote && !freezeTx && (
            <div className="panel__body" style={{ borderTop: "1px solid var(--line)" }}>
              <p className="micro dim">{sweepNote}</p>
            </div>
          )}

          {(freezeTx || freezeError) && (
            <div className="panel__body" style={{ borderTop: "1px solid var(--line)" }}>
              {freezeTx ? (
                <p className="micro">
                  <span style={{ color: "green" }}>● Confirmed on Hedera testnet</span>{" "}
                  —{" "}
                  <a
                    href={`https://hashscan.io/testnet/transaction/${freezeTx}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mono"
                  >
                    {freezeTx.slice(0, 18)}…
                  </a>
                </p>
              ) : (
                <p className="micro" style={{ color: "crimson" }}>
                  ● The freeze did not go through ({freezeError}). Nothing changed
                  on-chain.
                </p>
              )}
            </div>
          )}

          {freezeTarget && (
            <div className="panel__body" style={{ borderTop: "1px solid var(--line)" }}>
              <div className="notice notice--alert">
                <span className="notice__icon" aria-hidden="true">
                  !
                </span>
                <div style={{ flex: 1 }}>
                  <strong>
                    Freeze Room{" "}
                    {rooms.findIndex((room) => room.id === freezeTarget) + 1}?
                  </strong>
                  <p>
                    The public verification page will immediately show{" "}
                    <b>Frozen — under review</b>. A reason is required and will
                    be written to the audit log.
                  </p>
                  <div className="field" style={{ marginTop: 12 }}>
                    <label htmlFor="freeze-reason">Reason</label>
                    <input
                      id="freeze-reason"
                      value={freezeReason}
                      onChange={(event) => setFreezeReason(event.target.value)}
                      placeholder="Duplicate broker claim raised at the viewing."
                    />
                  </div>
                  <div className="flex wrap gap-8" style={{ marginTop: 12 }}>
                    <button
                      type="button"
                      className="btn btn--alert btn--small"
                      disabled={!freezeReason.trim() || freezing !== null}
                      onClick={() => {
                        const target = freezeTarget;
                        const reason = freezeReason.trim();
                        const room = rooms.find((r) => r.id === target);
                        setFreezeTarget(null);
                        setFreezeReason("");
                        void runFreeze(
                          target,
                          "freeze",
                          reason,
                          room?.name ?? `Room ${target}`,
                        );
                      }}
                    >
                      Freeze room
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost btn--small"
                      onClick={() => setFreezeTarget(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="panel" id="audit" style={{ marginTop: 24 }}>
        <div className="panel__head">
          <h2>Audit log</h2>
          <span className="badge badge--quiet">{audit.length} entries</span>
        </div>
        <div className="panel__body panel__body--flush">
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Target</th>
                  <th>Actor</th>
                  <th>Reason</th>
                  <th>Time</th>
                  <th>Transaction</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((entry) => (
                  <tr key={entry.id}>
                    <td>
                      <strong>{entry.action}</strong>
                    </td>
                    <td>{entry.target}</td>
                    <td className="mono">{entry.actor}</td>
                    <td>{entry.reason}</td>
                    <td>{entry.time}</td>
                    <td className="mono">
                      {entry.tx ? (
                        <a
                          href={`https://hashscan.io/testnet/transaction/${entry.tx}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {entry.tx.slice(0, 12)}…
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <div className="between wrap mt-24">
        <Link href="/marketplace" className="text-link">
          Browse the public listings
        </Link>
        <span className="micro dim">
          Every decision above links to its Hedera transaction.
        </span>
      </div>
    </>
  );
}
