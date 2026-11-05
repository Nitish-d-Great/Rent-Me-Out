"use client";

import Link from "next/link";
import { useState } from "react";
import { ApprovalBadge, StatusStamp } from "@/components/ui/status-stamp";
import {
  applications as seedApplications,
  demo,
  formatDate,
  rooms,
  type RoomState,
} from "@/lib/data";

type AuditEntry = {
  id: string;
  action: string;
  target: string;
  actor: string;
  reason: string;
  time: string;
  tx: string;
};

const initialAudit: AuditEntry[] = [
  {
    id: "audit-1",
    action: "Property approved",
    target: "APP-1036 · Versova 2BHK",
    actor: "registrar.hedera",
    reason: "Deed and society NOC verified",
    time: "2026-10-30 11:42",
    tx: "0.0.5941282@1778…",
  },
  {
    id: "audit-2",
    action: "Room sold",
    target: "Room 2 · Ashoka Residency",
    actor: "contract event",
    reason: "USDC + token transfer confirmed",
    time: "2027-01-02 15:08",
    tx: demo.purchaseTx,
  },
];

export function RegistrarConsole() {
  const [apps, setApps] = useState(seedApplications);
  const [selectedId, setSelectedId] = useState("APP-1042");
  const [rejection, setRejection] = useState("");
  const [processing, setProcessing] = useState<"approve" | "reject" | null>(
    null,
  );
  const [roomStates, setRoomStates] = useState<Record<string, RoomState>>({
    r1: "available",
    r2: "held",
    r3: "available",
  });
  const [freezeTarget, setFreezeTarget] = useState<string | null>(null);
  const [freezeReason, setFreezeReason] = useState("");
  const [audit, setAudit] = useState(initialAudit);

  const selected = apps.find((app) => app.id === selectedId) ?? apps[0];

  const pushAudit = (
    action: string,
    target: string,
    reason: string,
    tx = "0.0.5941282@1779…",
  ) => {
    setAudit((current) => [
      {
        id: `audit-${Date.now()}`,
        action,
        target,
        actor: "registrar.hedera",
        reason,
        time: new Intl.DateTimeFormat("en-GB", {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date()),
        tx,
      },
      ...current,
    ]);
  };

  const decide = (decision: "approved" | "rejected") => {
    if (!selected || selected.status !== "pending") return;
    if (decision === "rejected" && !rejection.trim()) return;
    setProcessing(decision === "approved" ? "approve" : "reject");
    window.setTimeout(() => {
      setApps((current) =>
        current.map((app) =>
          app.id === selected.id
            ? {
                ...app,
                status: decision,
                rejectionReason:
                  decision === "rejected" ? rejection.trim() : undefined,
              }
            : app,
        ),
      );
      pushAudit(
        decision === "approved" ? "Property approved" : "Property rejected",
        `${selected.id} · ${selected.nickname}`,
        decision === "rejected" ? rejection.trim() : "Deed verified",
      );
      setProcessing(null);
      setRejection("");
    }, 1300);
  };

  const pending = apps.filter((app) => app.status === "pending").length;
  const roomList = rooms.map((room, index) => ({
    ...room,
    index,
    state: roomStates[room.id] ?? room.state,
  }));

  return (
    <>
      <div className="metric-row">
        <div className="metric">
          <div className="metric__label">Pending applications</div>
          <div className="metric__value">{pending}</div>
        </div>
        <div className="metric">
          <div className="metric__label">Approved this month</div>
          <div className="metric__value">
            1 <small>Versova 2BHK</small>
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
            <span className="badge badge--brass">{pending} pending</span>
          </div>
          <div className="queue-list">
            {apps.map((app) => (
              <button
                key={app.id}
                type="button"
                className="queue-item"
                data-selected={app.id === selectedId}
                onClick={() => {
                  setSelectedId(app.id);
                  setRejection("");
                }}
              >
                <span className="queue-item__id mono">{app.id}</span>
                <strong>{app.nickname}</strong>
                <span className="queue-item__meta">
                  {app.locality} · {app.rooms} rooms ·{" "}
                  {formatDate(app.submittedAt)}
                </span>
                <span style={{ marginTop: 8 }}>
                  <ApprovalBadge state={app.status} />
                </span>
              </button>
            ))}
          </div>
        </aside>

        <section className="panel">
          <div className="panel__head">
            <div>
              <h2>{selected.nickname}</h2>
              <span className="micro dim">
                {selected.id} · submitted {formatDate(selected.submittedAt)}
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
              <div className="deed-viewer__paper" aria-label="Restricted deed preview">
                <span className="micro dim">Strictly restricted preview</span>
                <h3>Deed of lease · {selected.nickname}</h3>
                <span className="deed-viewer__line" />
                <span className="deed-viewer__line" />
                <span className="deed-viewer__line deed-viewer__line--short" />
                <span className="deed-viewer__line" />
                <span className="deed-viewer__line deed-viewer__line--short" />
                <div className="deed-viewer__seal">REGISTRAR COPY</div>
                <p className="micro dim">
                  Page 1 of {selected.deedPages} · decrypted in-memory · access
                  audited
                </p>
              </div>
            </div>

            <div className="deed-side">
              <p className="eyebrow">Owner + property</p>
              <div className="buy-panel__list" style={{ marginTop: 12 }}>
                <div>
                  <span>Owner wallet</span>
                  <span className="mono">
                    {selected.ownerWallet.slice(0, 6)}…
                    {selected.ownerWallet.slice(-4)}
                  </span>
                </div>
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
                  <span>Deed</span>
                  <span className="mono">{selected.deedPages} pages</span>
                </div>
                <div>
                  <span>World ID</span>
                  <span className="green">Validated</span>
                </div>
                <div>
                  <span>Commitment</span>
                  <span className="mono">0x89bb…3ad2</span>
                </div>
              </div>

              <div className="notice notice--brass" style={{ marginTop: 14 }}>
                <span className="notice__icon" aria-hidden="true">
                  i
                </span>
                <div>
                  <p>{selected.note}</p>
                </div>
              </div>

              {selected.status === "pending" ? (
                <div style={{ marginTop: 18 }}>
                  <div className="field">
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
                  <div className="flex wrap gap-8" style={{ marginTop: 12 }}>
                    <button
                      type="button"
                      className="btn btn--verified btn--small"
                      onClick={() => decide("approved")}
                      disabled={processing !== null}
                    >
                      {processing === "approve"
                        ? "Registering on Hedera…"
                        : "Approve property"}
                    </button>
                    <button
                      type="button"
                      className="btn btn--alert btn--small"
                      onClick={() => decide("rejected")}
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
                        : selected.rejectionReason}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      <section className="panel" id="properties" style={{ marginTop: 24 }}>
        <div className="panel__head">
          <h2>Rooms + dispute controls</h2>
          <span className="badge badge--quiet">Room 2 · Ashoka Residency</span>
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
                {roomList.map((room) => (
                  <tr key={room.id}>
                    <td>
                      <strong>Room {room.index + 1}</strong>
                      <div className="dim" style={{ fontSize: 10 }}>
                        {room.name.split("·")[1]?.trim()}
                      </div>
                    </td>
                    <td className="mono">{room.tokenId}</td>
                    <td className="mono">
                      {room.state === "held" || room.state === "frozen"
                        ? demo.brokerShort
                        : "—"}
                    </td>
                    <td>{demo.periodLabel}</td>
                    <td>
                      <StatusStamp state={room.state} />
                    </td>
                    <td>
                      {room.state === "frozen" ? (
                        <button
                          type="button"
                          className="btn btn--ghost btn--small"
                          onClick={() => {
                            setRoomStates({ ...roomStates, [room.id]: "held" });
                            pushAudit(
                              "Room unfrozen",
                              `Room ${room.index + 1} · Ashoka Residency`,
                              "Dispute resolved",
                            );
                          }}
                        >
                          Unfreeze
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
                      disabled={!freezeReason.trim()}
                      onClick={() => {
                        setRoomStates({
                          ...roomStates,
                          [freezeTarget]: "frozen",
                        });
                        pushAudit(
                          "Room frozen",
                          `Room ${
                            rooms.findIndex((room) => room.id === freezeTarget) +
                            1
                          } · Ashoka Residency`,
                          freezeReason.trim(),
                        );
                        setFreezeTarget(null);
                        setFreezeReason("");
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
                    <td className="mono">{entry.tx}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <div className="between wrap mt-24">
        <Link href="/verify/rmo-3b-andheri?room=r2" className="text-link">
          Open the tenant-facing page
        </Link>
        <span className="micro dim">
          Registrar actions are permissioned and audited in this demo.
        </span>
      </div>
    </>
  );
}
