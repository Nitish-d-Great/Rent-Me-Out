"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { connectArkivWallet, type ArkivWalletClient } from "@/lib/arkiv";
import {
  fetchPendingPropertyApplications,
  registrarWallets,
  submitReview,
  type PropertyApplicationRecord,
} from "@/lib/property-applications";
import {
  decryptDeedInBrowser,
  type DeedKeyFile,
} from "@/lib/swarm-upload";

function dateLabel(seconds: number) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(seconds * 1000));
}

function isDeedKeyFile(value: unknown): value is DeedKeyFile {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<DeedKeyFile>;
  return (
    candidate.version === 1 &&
    candidate.algorithm === "AES-GCM" &&
    typeof candidate.applicationKey === "string" &&
    typeof candidate.reference === "string" &&
    typeof candidate.key === "string" &&
    typeof candidate.iv === "string" &&
    typeof candidate.fileName === "string"
  );
}

export function RegistrarConsole() {
  const [applications, setApplications] = useState<PropertyApplicationRecord[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [wallet, setWallet] = useState<ArkivWalletClient | null>(null);
  const [reviewer, setReviewer] = useState<`0x${string}` | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const [deedName, setDeedName] = useState("");
  const [deedUrl, setDeedUrl] = useState<string | null>(null);
  const [reviewReceipt, setReviewReceipt] = useState<{
    status: "approved" | "rejected";
    txHash: string;
  } | null>(null);

  const selected = applications.find((application) => application.key === selectedKey) ?? null;
  const configured = registrarWallets.length > 0;
  const isAuthorized = Boolean(
    reviewer && registrarWallets.includes(reviewer.toLowerCase()),
  );
  const pendingCount = applications.length;

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const next = await fetchPendingPropertyApplications();
      setApplications(next);
      setSelectedKey((current) =>
        current && next.some((application) => application.key === current)
          ? current
          : next[0]?.key ?? null,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load Arkiv applications.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => () => {
    if (deedUrl) URL.revokeObjectURL(deedUrl);
  }, [deedUrl]);

  const connectReviewer = async () => {
    setError("");
    try {
      const connected = await connectArkivWallet();
      if (!registrarWallets.includes(connected.account.toLowerCase())) {
        setWallet(null);
        setReviewer(null);
        throw new Error("This wallet is not on the configured registrar allowlist.");
      }
      setWallet(connected.walletClient);
      setReviewer(connected.account);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not connect registrar wallet.");
    }
  };

  const openDeed = async (file?: File) => {
    if (!file || !selected) return;
    setError("");
    setDeedUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!isDeedKeyFile(parsed)) {
        throw new Error("Choose the deed key JSON file supplied by the owner.");
      }
      if (!parsed.applicationKey || parsed.applicationKey.toLowerCase() !== selected.key.toLowerCase()) {
        throw new Error("This key file belongs to a different application.");
      }
      const blob = await decryptDeedInBrowser(parsed);
      setDeedName(parsed.fileName);
      setDeedUrl(URL.createObjectURL(blob));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not decrypt this deed.");
    }
  };

  const decide = async (status: "approved" | "rejected") => {
    if (!wallet || !reviewer || !selected || !isAuthorized) return;
    if (status === "rejected" && !reason.trim()) return;
    if (!deedUrl) {
      setError("Open and review the matching deed before recording a decision.");
      return;
    }
    setProcessing(true);
    setError("");
    setReviewReceipt(null);
    try {
      const receipt = await submitReview(
        wallet,
        reviewer,
        selected.key,
        status,
        reason.trim(),
      );
      setReviewReceipt({ status, txHash: receipt.txHash });
      setReason("");
      setDeedUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return null;
      });
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not record the review on Arkiv.");
    } finally {
      setProcessing(false);
    }
  };

  const walletLabel = useMemo(() =>
    reviewer ? `${reviewer.slice(0, 8)}…${reviewer.slice(-6)}` : "No reviewer wallet connected",
  [reviewer]);

  if (!configured) {
    return (
      <section className="panel panel--pad">
        <h2>Registrar access is not configured</h2>
        <p className="small" style={{ marginTop: 10 }}>
          Set NEXT_PUBLIC_REGISTRAR_WALLETS to a comma-separated list of registrar
          Rabdi wallet addresses, then rebuild.
        </p>
      </section>
    );
  }

  return (
    <>
      <div className="metric-row">
        <div className="metric">
          <div className="metric__label">Pending applications</div>
          <div className="metric__value">{loading ? "…" : pendingCount}</div>
        </div>
        <div className="metric">
          <div className="metric__label">Registrar wallet</div>
          <div className="metric__value" style={{ fontSize: 16 }}>{walletLabel}</div>
        </div>
        <div className="metric">
          <div className="metric__label">Queue source</div>
          <div className="metric__value" style={{ fontSize: 16 }}>Arkiv · Rabdi</div>
        </div>
      </div>

      <div className="form-actions" style={{ marginTop: 0 }}>
        <button type="button" className="btn btn--small" onClick={() => void connectReviewer()}>
          {reviewer ? "Reconnect registrar wallet" : "Connect registrar wallet"}
        </button>
        <button type="button" className="btn btn--small btn--ghost" onClick={() => void reload()} disabled={loading}>
          Refresh queue
        </button>
        {reviewer && !isAuthorized && <span className="badge badge--alert">Not authorized</span>}
      </div>

      {error && (
        <div className="notice notice--alert" role="alert" style={{ marginTop: 16 }}>
          <div><strong>Registrar action failed</strong><p>{error}</p></div>
        </div>
      )}

      {reviewReceipt && (
        <div className="notice notice--verified" style={{ marginTop: 16 }}>
          <div>
            <strong>Review recorded: {reviewReceipt.status}</strong>
            <p className="mono" style={{ overflowWrap: "anywhere" }}>Arkiv transaction: {reviewReceipt.txHash}</p>
          </div>
        </div>
      )}

      <div className="registrar-grid" style={{ marginTop: 20 }}>
        <aside className="panel">
          <div className="panel__head">
            <h2>Review queue</h2>
            <span className="badge badge--brass">{pendingCount} pending</span>
          </div>
          <div className="queue-list">
            {!loading && applications.length === 0 && (
              <p className="small" style={{ padding: 16 }}>No pending property applications.</p>
            )}
            {applications.map((application) => (
              <button
                key={application.key}
                type="button"
                className="queue-item"
                data-selected={application.key === selected?.key}
                onClick={() => {
                  setSelectedKey(application.key);
                  setDeedUrl((current) => {
                    if (current) URL.revokeObjectURL(current);
                    return null;
                  });
                  setDeedName("");
                  setError("");
                  setReviewReceipt(null);
                }}
              >
                <span className="queue-item__id mono">{application.key.slice(0, 14)}…</span>
                <strong>{application.propertyName}</strong>
                <span className="queue-item__meta">
                  {application.locality}, {application.city} · {application.roomCount} rooms · {dateLabel(application.submittedAt)}
                </span>
                <span style={{ marginTop: 8 }} className="badge badge--brass">Pending review</span>
              </button>
            ))}
          </div>
        </aside>

        <section className="panel">
          {!selected ? (
            <div className="panel__body"><h2>Select a pending application</h2></div>
          ) : (
            <>
              <div className="panel__head">
                <div>
                  <h2>{selected.propertyName}</h2>
                  <span className="micro dim">{selected.key} · submitted {dateLabel(selected.submittedAt)}</span>
                </div>
                <span className="badge badge--brass">Pending</span>
              </div>
              <div className="panel__body">
                <div className="buy-panel__list">
                  <div><span>Owner wallet</span><span className="mono">{selected.owner.slice(0, 8)}…{selected.owner.slice(-6)}</span></div>
                  <div><span>Locality</span><span>{selected.locality}, {selected.city}</span></div>
                  <div><span>Rooms requested</span><span>{selected.roomCount}</span></div>
                  <div><span>Submitted</span><span>{dateLabel(selected.submittedAt)}</span></div>
                </div>

                <div className="field" style={{ marginTop: 20 }}>
                  <label htmlFor="deed-key-file">Open the deed key file shared securely by the owner</label>
                  <input
                    id="deed-key-file"
                    type="file"
                    accept="application/json,.json"
                    onChange={(event) => void openDeed(event.target.files?.[0])}
                  />
                  <span className="field__hint">The key file is processed in this browser and is not uploaded to the app or Arkiv.</span>
                </div>

                {deedUrl ? (
                  <div className="deed-review" style={{ marginTop: 18 }}>
                    <div className="deed-viewer" style={{ width: "100%" }}>
                      <div className="deed-viewer__bar"><span className="mono">{deedName}</span><span className="badge badge--verified">Decrypted in browser</span></div>
                      <iframe title={`Deed for ${selected.propertyName}`} src={deedUrl} style={{ width: "100%", height: 520, border: 0, background: "white" }} />
                    </div>
                  </div>
                ) : (
                  <div className="notice notice--brass" style={{ marginTop: 16 }}>
                    <div><strong>Deed is not open</strong><p>The owner must send the matching key JSON file to the authorized registrar through a secure channel.</p></div>
                  </div>
                )}

                <div className="field" style={{ marginTop: 18 }}>
                  <label htmlFor="review-reason">Review note {reason.trim() ? "" : "· required to reject"}</label>
                  <textarea id="review-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Record a concise, non-sensitive review note." />
                </div>

                <div className="flex wrap gap-8" style={{ marginTop: 14 }}>
                  <button type="button" className="btn btn--verified btn--small" onClick={() => void decide("approved")} disabled={!isAuthorized || !deedUrl || processing}>
                    {processing ? "Recording…" : "Approve property"}
                  </button>
                  <button type="button" className="btn btn--alert btn--small" onClick={() => void decide("rejected")} disabled={!isAuthorized || !deedUrl || !reason.trim() || processing}>
                    Reject with reason
                  </button>
                </div>
                <p className="form-actions__note" style={{ marginTop: 12 }}>
                  Decisions are new Arkiv entities signed by the registrar wallet. The application and review metadata are public; deed contents and key remain off Arkiv.
                </p>
              </div>
            </>
          )}
        </section>
      </div>
    </>
  );
}
