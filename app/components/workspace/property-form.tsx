"use client";

import Link from "next/link";
import { useState } from "react";
import { useWallet } from "@/components/providers";
import { VerifyBadge } from "@/components/ui/verify-badge";
import { WorldIdButton } from "@/components/ui/world-id-button";
import {
  downloadDeedKeyFile,
  encryptAndUploadDeed,
  type DeedKeyFile,
} from "@/lib/swarm-upload";
import { connectArkivWallet } from "@/lib/arkiv";
import {
  createPropertyApplication,
  fetchApplicationReview,
} from "@/lib/property-applications";

type SubmitState = "idle" | "submitting" | "submitted";

export function PropertyForm() {
  const { connected, connect } = useWallet();
  const [verified, setVerified] = useState(false);
  const [submit, setSubmit] = useState<SubmitState>("idle");
  const [deed, setDeed] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState("");
  const [reviewStatus, setReviewStatus] = useState<{
    status: "approved" | "rejected";
    reason: string;
    reviewedAt: number;
  } | null>(null);
  const [checkingReview, setCheckingReview] = useState(false);
  const [uploadReceipt, setUploadReceipt] = useState<{
    reference: string;
    keyFile: DeedKeyFile;
    applicationKey: string;
    txHash: string;
  } | null>(null);
  const [form, setForm] = useState({
    nickname: "Bandra studio",
    locality: "Bandra East",
    city: "Mumbai",
    rooms: "2",
    privacy: false,
  });

  const required =
    form.nickname.trim() &&
    form.locality.trim() &&
    form.city.trim() &&
    form.rooms &&
    deed &&
    form.privacy;
  const canSubmit = connected && verified && Boolean(required);

  const refreshReview = async () => {
    if (!uploadReceipt) return;
    setCheckingReview(true);
    setUploadError("");
    try {
      setReviewStatus(await fetchApplicationReview(uploadReceipt.applicationKey));
    } catch (error) {
      setUploadError(
        error instanceof Error ? error.message : "Could not check the Arkiv review status.",
      );
    } finally {
      setCheckingReview(false);
    }
  };

  const submitForm = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit || !deed) return;
    setUploadError("");
    setSubmit("submitting");
    let recoveryKeyFile: DeedKeyFile | null = null;
    try {
      const { account, walletClient } = await connectArkivWallet();
      const receipt = await encryptAndUploadDeed(deed);
      recoveryKeyFile = receipt.keyFile;
      const application = await createPropertyApplication(walletClient, {
        owner: account,
        propertyName: form.nickname.trim(),
        locality: form.locality.trim(),
        city: form.city.trim(),
        roomCount: Number(form.rooms),
      });
      const keyFile = { ...receipt.keyFile, applicationKey: application.entityKey };
      downloadDeedKeyFile(keyFile);
      setUploadReceipt({
        ...receipt,
        keyFile,
        applicationKey: application.entityKey,
        txHash: application.txHash,
      });
      setSubmit("submitted");
    } catch (error) {
      if (recoveryKeyFile) downloadDeedKeyFile(recoveryKeyFile);
      setUploadError(
        recoveryKeyFile
          ? `The deed uploaded, but its Arkiv application was not created. A recovery key file was downloaded; keep it and check the transaction before retrying. ${error instanceof Error ? error.message : "Arkiv write failed."}`
          : error instanceof Error ? error.message : "The encrypted deed upload failed.",
      );
      setSubmit("idle");
    }
  };

  if (submit === "submitted") {
    return (
      <div className="panel" style={{ marginTop: 28 }}>
        <div className="panel__head">
          <h2>Property submitted</h2>
          <span className="badge badge--verified">Arkiv · pending review</span>
        </div>
        <div className="panel__body">
          <div className="notice notice--verified">
            <span className="notice__icon" aria-hidden="true">
              ✓
            </span>
            <div>
              <strong>
                {form.nickname} was submitted for registrar review.
              </strong>
              <p>
                Arkiv stores only public-safe application fields. The deed
                reference and key stay in the downloaded key file. Share it
                with the assigned registrar only through a secure channel.
              </p>
            </div>
          </div>

          <div className="detail-meta" style={{ marginTop: 22 }}>
            <div>
              <span className="micro">Arkiv application</span>
              <strong className="mono">{uploadReceipt?.applicationKey.slice(0, 14)}…</strong>
            </div>
            <div>
              <span className="micro">Status</span>
              <strong>{reviewStatus?.status ?? "Pending review"}</strong>
            </div>
            <div>
              <span className="micro">Rooms requested</span>
              <strong>{form.rooms}</strong>
            </div>
            <div>
              <span className="micro">Deed</span>
              <strong className="mono">{deed?.name}</strong>
            </div>
          </div>

          {reviewStatus && (
            <div className={`notice ${reviewStatus.status === "approved" ? "notice--verified" : "notice--alert"}`} style={{ marginTop: 18 }}>
              <div>
                <strong>Registrar {reviewStatus.status}</strong>
                <p>{reviewStatus.reason || "No additional review note."}</p>
                <p className="micro">Reviewed {new Date(reviewStatus.reviewedAt * 1000).toLocaleString()}</p>
              </div>
            </div>
          )}

          <div className="timeline" style={{ marginTop: 24 }}>
            <div className="timeline__item" data-done="true">
              <span className="timeline__dot" />
              <div>
                <strong>World ID validated</strong>
                <span>World ID check completed in this session</span>
              </div>
            </div>
            <div className="timeline__item" data-done="true">
              <span className="timeline__dot" />
              <div>
                <strong>Deed encrypted and uploaded</strong>
                <span>Swarm · client encrypted</span>
              </div>
            </div>
            <div className="timeline__item">
              <span className="timeline__dot" />
              <div>
                <strong>Registrar review</strong>
                <span>Share the key file securely with the registrar</span>
              </div>
            </div>
            <div className="timeline__item">
              <span className="timeline__dot" />
              <div>
                <strong>Property listing</strong>
                <span>Submit a listing separately through the Arkiv flow</span>
              </div>
            </div>
          </div>

          {uploadReceipt && (
            <div className="notice notice--brass" style={{ marginTop: 18 }}>
              <div>
                <strong>Key file downloaded · keep it private</strong>
                <p>
                  This file is needed to decrypt the deed. Anyone with the file
                  and Swarm reference can decrypt it.
                </p>
                <p className="mono" style={{ marginTop: 8, overflowWrap: "anywhere" }}>
                  Arkiv application: {uploadReceipt.applicationKey}
                </p>
                <p className="mono" style={{ marginTop: 8, overflowWrap: "anywhere" }}>
                  Arkiv transaction: {uploadReceipt.txHash}
                </p>
                <p className="mono" style={{ marginTop: 8, overflowWrap: "anywhere" }}>
                  Swarm reference: {uploadReceipt.reference}
                </p>
                <button
                  type="button"
                  className="btn btn--small"
                  style={{ marginTop: 12 }}
                  onClick={() => downloadDeedKeyFile(uploadReceipt.keyFile)}
                >
                  Download deed key file
                </button>
              </div>
            </div>
          )}

          <div className="form-actions">
            <button type="button" className="btn btn--ghost" onClick={() => void refreshReview()} disabled={checkingReview}>
              {checkingReview ? "Checking Arkiv…" : "Refresh review status"}
            </button>
            <Link href="/owner" className="btn">
              Back to dashboard
            </Link>
            <Link href="/owner/listings/new" className="btn btn--ghost">
              Preview listing builder
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submitForm}>
      <section className="panel" style={{ marginTop: 28 }}>
        <div className="panel__head">
          <h2>Step 1 · Identity and wallet</h2>
          {verified ? (
            <VerifyBadge label="Owner verified" />
          ) : (
            <span className="badge badge--brass">Required</span>
          )}
        </div>
        <div className="panel__body">
          {!connected ? (
            <div className="notice notice--brass">
              <span className="notice__icon" aria-hidden="true">
                1
              </span>
              <div style={{ flex: 1 }}>
                <strong>Connect the wallet that will submit the application.</strong>
                <p>
                  The application is written to Arkiv Rabdi and owned by this
                  wallet. A Rabdi network switch may be requested at submit.
                </p>
                <button
                  type="button"
                  className="btn btn--small"
                  style={{ marginTop: 12 }}
                  onClick={() => void connect()}
                >
                  Connect demo wallet
                </button>
              </div>
            </div>
          ) : !verified ? (
            <div className="notice notice--brass">
              <span className="notice__icon" aria-hidden="true">
                2
              </span>
              <div style={{ flex: 1 }}>
                <strong>Verify that you are a unique person.</strong>
                <p>
                  World ID generates a proof on your device. Our backend checks
                  it and binds a nullifier to your wallet. Submit stays locked
                  until this validates.
                </p>
                <div style={{ marginTop: 12 }}>
                  <WorldIdButton
                    action="owner-verify"
                    label="Verify with World ID"
                    onVerified={() => setVerified(true)}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="notice notice--verified">
              <span className="notice__icon" aria-hidden="true">
                ✓
              </span>
              <div>
                <strong>Identity check complete.</strong>
                <p>
                  Only a nullifier is stored against this wallet. No face or ID
                  document is kept.
                </p>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="panel__head">
          <h2>Step 2 · Property details</h2>
          <span className="badge badge--quiet">Some fields are public on Arkiv</span>
        </div>
        <div className="panel__body">
          <div className="form-grid">
            <div className="field">
              <label htmlFor="nickname">Property nickname</label>
              <input
                id="nickname"
                value={form.nickname}
                onChange={(event) =>
                  setForm({ ...form, nickname: event.target.value })
                }
                placeholder="Bandra studio"
              />
              <span className="field__hint">
                This is the public name. Do not use a flat number.
              </span>
            </div>
            <div className="field">
              <label htmlFor="rooms">Number of rooms</label>
              <select
                id="rooms"
                value={form.rooms}
                onChange={(event) =>
                  setForm({ ...form, rooms: event.target.value })
                }
              >
                <option value="1">1 room</option>
                <option value="2">2 rooms</option>
                <option value="3">3 rooms</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="locality">Locality</label>
              <input
                id="locality"
                value={form.locality}
                onChange={(event) =>
                  setForm({ ...form, locality: event.target.value })
                }
              />
            </div>
            <div className="field">
              <label htmlFor="city">City</label>
              <input
                id="city"
                value={form.city}
                onChange={(event) =>
                  setForm({ ...form, city: event.target.value })
                }
              />
            </div>
          </div>
        </div>
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="panel__head">
          <h2>Step 3 · Deed and privacy notice</h2>
          <span className="badge badge--quiet">Encrypted before upload</span>
        </div>
        <div className="panel__body">
          <div className="dropzone">
            <strong>Upload the property deed as a PDF</strong>
              <span>PDF only · up to 25 MB · encrypted in this browser before upload</span>
            <input
              type="file"
              accept="application/pdf"
              aria-label="Deed PDF"
              onChange={(event) => {
                const file = event.target.files?.[0];
                setDeed(file ?? null);
              }}
            />
            {deed && (
              <span className="badge badge--verified">
                <span className="badge__check" aria-hidden="true">
                  ✓
                </span>
                {deed.name}
              </span>
            )}
          </div>

          <div className="notice notice--brass" style={{ marginTop: 16 }}>
            <span className="notice__icon" aria-hidden="true">
              i
            </span>
            <div>
                <strong>Only encrypted bytes are uploaded.</strong>
              <p>
                Encryption happens locally in this browser. Arkiv stores the
                public-safe property fields. The Swarm reference and key stay
                in the downloaded key file. Do not include an exact address;
                the key file cannot be recovered if lost.
              </p>
            </div>
          </div>

          {uploadError && (
            <div className="notice notice--brass" role="alert" style={{ marginTop: 16 }}>
              <div>
                <strong>Upload failed</strong>
                <p>{uploadError}</p>
              </div>
            </div>
          )}

          <label className="choice" style={{ marginTop: 16 }}>
            <input
              type="checkbox"
              checked={form.privacy}
              onChange={(event) =>
                setForm({ ...form, privacy: event.target.checked })
              }
            />
            I understand the privacy notice and that this is not a title
            guarantee.
          </label>
        </div>
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="panel__head">
          <h2>Step 4 · Encrypt and upload</h2>
          <span className="badge badge--quiet">Arkiv · Rabdi</span>
        </div>
        <div className="panel__body">
          <div className="form-actions" style={{ marginTop: 0, paddingTop: 0, borderTop: 0 }}>
            <div>
              <button
                type="submit"
                className="btn"
                disabled={!canSubmit || submit === "submitting"}
              >
                {submit === "submitting"
                  ? "Encrypting and uploading…"
                  : "Encrypt and upload deed"}
              </button>
              {!canSubmit && (
                <p className="form-lock" style={{ marginTop: 10 }}>
                  <span aria-hidden="true">●</span>
                  {!connected
                    ? "Connect a wallet to continue."
                    : !verified
                      ? "Verify your identity to submit this property."
                      : !deed
                        ? "Upload a deed PDF to submit."
                        : !form.privacy
                          ? "Accept the privacy notice to submit."
                          : "Complete the property fields to submit."}
                </p>
              )}
            </div>
            <p className="form-actions__note">
              This uploads the encrypted deed to Swarm and writes a public-safe
              application record to Arkiv. Keep the key file and share it with
              the registrar securely.
            </p>
          </div>
        </div>
      </section>
    </form>
  );
}
