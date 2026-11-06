"use client";

import Link from "next/link";
import { useState } from "react";
import { useWallet } from "@/components/providers";
import { VerifyBadge } from "@/components/ui/verify-badge";
import { WorldIdButton } from "@/components/ui/world-id-button";

type SubmitState = "idle" | "submitting" | "submitted";

export function PropertyForm() {
  const { connected, connect } = useWallet();
  const [verified, setVerified] = useState(false);
  const [submit, setSubmit] = useState<SubmitState>("idle");
  const [deed, setDeed] = useState<string>("");
  const [form, setForm] = useState({
    nickname: "Bandra studio",
    locality: "Bandra East",
    city: "Mumbai",
    rooms: "2",
    details:
      "A compact two-room flat with a separate entry. One room is reserved for family use.",
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

  const submitForm = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmit("submitting");
    window.setTimeout(() => setSubmit("submitted"), 1400);
  };

  if (submit === "submitted") {
    return (
      <div className="panel" style={{ marginTop: 28 }}>
        <div className="panel__head">
          <h2>Application received</h2>
          <span className="badge badge--brass">Pending registrar review</span>
        </div>
        <div className="panel__body">
          <div className="notice notice--verified">
            <span className="notice__icon" aria-hidden="true">
              ✓
            </span>
            <div>
              <strong>
                {form.nickname} is in the encrypted review queue.
              </strong>
              <p>
                The deed was encrypted before upload. The registrar can open it
                through an audited route; no public index record contains the
                document or a cleartext storage pointer.
              </p>
            </div>
          </div>

          <div className="detail-meta" style={{ marginTop: 22 }}>
            <div>
              <span className="micro">Application</span>
              <strong className="mono">APP-1046</strong>
            </div>
            <div>
              <span className="micro">Status</span>
              <strong>Pending review</strong>
            </div>
            <div>
              <span className="micro">Rooms requested</span>
              <strong>{form.rooms}</strong>
            </div>
            <div>
              <span className="micro">Deed</span>
              <strong className="mono">{deed}</strong>
            </div>
          </div>

          <div className="timeline" style={{ marginTop: 24 }}>
            <div className="timeline__item" data-done="true">
              <span className="timeline__dot" />
              <div>
                <strong>World ID validated</strong>
                <span>Nullifier bound to wallet</span>
              </div>
            </div>
            <div className="timeline__item" data-done="true">
              <span className="timeline__dot" />
              <div>
                <strong>Deed encrypted and uploaded</strong>
                <span>Swarm · registrar-only decrypt</span>
              </div>
            </div>
            <div className="timeline__item">
              <span className="timeline__dot" />
              <div>
                <strong>Registrar decides</strong>
                <span>Approve on Hedera or reject with a reason</span>
              </div>
            </div>
            <div className="timeline__item">
              <span className="timeline__dot" />
              <div>
                <strong>Listing opens</strong>
                <span>One room token per room, when you choose</span>
              </div>
            </div>
          </div>

          <div className="form-actions">
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
                <strong>Connect a Hedera-compatible wallet.</strong>
                <p>
                  The property application is bound to this wallet. The same
                  identity cannot submit from a second wallet.
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
          <span className="badge badge--quiet">Private until approved</span>
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
            <div className="field field--wide">
              <label htmlFor="details">Short property description</label>
              <textarea
                id="details"
                value={form.details}
                onChange={(event) =>
                  setForm({ ...form, details: event.target.value })
                }
                placeholder="Room layout, entry, shared spaces, anything the registrar should know."
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
            <span>PDF only · up to 25 MB · encrypted before it leaves the server</span>
            <input
              type="file"
              accept="application/pdf"
              aria-label="Deed PDF"
              onChange={(event) => {
                const file = event.target.files?.[0];
                setDeed(file ? file.name : "");
              }}
            />
            {deed && (
              <span className="badge badge--verified">
                <span className="badge__check" aria-hidden="true">
                  ✓
                </span>
                {deed}
              </span>
            )}
            {!deed && (
              <button
                type="button"
                className="demo-chip"
                onClick={() => setDeed("bandra-studio-deed.pdf")}
              >
                Use sample deed for the demo
              </button>
            )}
          </div>

          <div className="notice notice--brass" style={{ marginTop: 16 }}>
            <span className="notice__icon" aria-hidden="true">
              i
            </span>
            <div>
              <strong>The deed is never public.</strong>
              <p>
                It is encrypted, stored privately, and visible only to the
                registrar through an authorised, audited review route. The public
                index sees an opaque application ID only.
              </p>
            </div>
          </div>

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
          <h2>Step 4 · Submit for review</h2>
          <span className="badge badge--quiet">Registrar reviews the deed</span>
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
                  : "Submit property for review"}
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
              On submit, the backend normalises the property, creates a random
              salt and commitment, encrypts the deed, and writes only an opaque
              pending application to Arkiv.
            </p>
          </div>
        </div>
      </section>
    </form>
  );
}
