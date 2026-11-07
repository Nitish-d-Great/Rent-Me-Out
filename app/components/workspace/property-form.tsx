"use client";

import Link from "next/link";
import { useState } from "react";
import { useWallet } from "@/components/providers";
import { getOrCreateIdentity } from "@/lib/chain/owner-identity";
import { useWalletVerified } from "@/lib/chain/use-owner";
import { VerifyBadge } from "@/components/ui/verify-badge";
import { WorldIdButton } from "@/components/ui/world-id-button";
import { LocationPicker, type PropertyCoordinates } from "./location-picker";

type SubmitState = "idle" | "submitting" | "submitted";

function toBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("deed_unreadable"));
    reader.readAsDataURL(file);
  });
}

/** A small placeholder, so the review flow can be tried without a real deed. */
function sampleDeed(): Blob {
  return new Blob(["%PDF-1.4\n% RentMeOut sample deed. Not a legal document.\n%%EOF\n"], {
    type: "application/pdf",
  });
}

export function PropertyForm() {
  const { connected, connect, address } = useWallet();
  const { verified, identityShort, confirm: setVerified } = useWalletVerified(address);
  const [submit, setSubmit] = useState<SubmitState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);
  const [commitment, setCommitment] = useState<string | null>(null);
  const [deed, setDeed] = useState<string>("");
  const [deedFile, setDeedFile] = useState<Blob | null>(null);
  const [location, setLocation] = useState<PropertyCoordinates | null>(null);
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
    location &&
    deed &&
    form.privacy;
  const canSubmit = connected && verified && Boolean(required);

  /**
   * Submits the application together with this device's Semaphore commitment.
   *
   * The identity secret is created here and stays in the browser: the registrar
   * approves a commitment, never the secret, which is what lets a later listing proof
   * stay unlinkable to this property.
   */
  const submitForm = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmit("submitting");
    setError(null);
    try {
      const identity = getOrCreateIdentity();
      if (!deedFile) throw new Error("no_deed");
      const deedBase64 = await toBase64(deedFile);
      const applicationId = `APP-${Date.now().toString(36).toUpperCase()}`;
      const res = await fetch("/api/properties", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "apply",
          applicationId,
          commitment: identity.commitment,
          nickname: form.nickname.trim(),
          locality: form.locality.trim(),
          city: form.city.trim(),
          latitudeE6: Math.round(location!.latitude * 1_000_000),
          longitudeE6: Math.round(location!.longitude * 1_000_000),
          rooms: Number(form.rooms),
          deedName: deed,
          deedBase64,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(
          data.error === "deed_too_large"
            ? "That deed is larger than 3 MB."
            : (data.error ?? "submit_failed"),
        );
        setSubmit("idle");
        return;
      }
      setReference(applicationId);
      setCommitment(identity.commitment);
      setSubmit("submitted");
    } catch {
      setError("network_error");
      setSubmit("idle");
    }
  };

  if (submit === "submitted") {
    return (
      <div className="panel" style={{ marginTop: 28 }}>
        <div className="panel__head">
          <h2>Application received</h2>
          <span className="badge badge--brass">Pending registrar review</span>
        </div>
        <div className="panel__body">
          {reference && (
            <p className="micro" style={{ marginBottom: 12 }}>
              Reference <span className="mono">{reference}</span>
              {commitment && (
                <>
                  {" · "}identity commitment{" "}
                  <span className="mono">{commitment.slice(0, 16)}…</span>
                  {" — "}the secret behind it stays on this device.
                </>
              )}
            </p>
          )}
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
            <VerifyBadge label="Owner verified" hash={identityShort} />
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
                    onVerified={setVerified}
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
          <div style={{ marginTop: 18 }}>
            <LocationPicker value={location} onChange={setLocation} />
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
            <span>PDF only · up to 3 MB · encrypted before it is stored on Swarm</span>
            <input
              type="file"
              accept="application/pdf"
              aria-label="Deed PDF"
              onChange={(event) => {
                const file = event.target.files?.[0];
                setDeed(file ? file.name : "");
                setDeedFile(file ?? null);
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
                onClick={() => {
                  setDeed("sample-deed.pdf");
                  setDeedFile(sampleDeed());
                }}
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
            I understand the deed and proposed location are encrypted for registrar review, the exact pin becomes public and permanent if listed, and neither the pin nor this process is a title guarantee.
          </label>
        </div>
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="panel__head">
          <h2>Step 4 · Submit for review</h2>
          <span className="badge badge--quiet">Registrar reviews the deed</span>
        </div>
        <div className="panel__body">
          {error && (
            <p className="micro" style={{ color: "crimson", marginBottom: 10 }}>
              ● The application was not submitted ({error}). Nothing was recorded.
            </p>
          )}
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
