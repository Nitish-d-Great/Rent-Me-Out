"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { readIdentity } from "@/lib/chain/owner-identity";
import { useOwnerApplications, useWalletVerified } from "@/lib/chain/use-owner";
import { explainListingError, proveListing, roomTag } from "@/lib/chain/prove-listing";

import { useWallet } from "@/components/providers";
import { VerifyBadge } from "@/components/ui/verify-badge";
import { WorldIdButton } from "@/components/ui/world-id-button";
import { formatDate, formatUsdc } from "@/lib/data";

type Phase = "idle" | "issuing" | "issued";

interface PublishedRoom {
  listingId?: string;
  token?: string;
  transactionHash?: string;
  indexed?: boolean;
  name: string;
  price: string;
}

const DAY_MS = 86_400_000;
const isoDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function ListingForm() {
  const { connected, connect, address } = useWallet();
  const { verified, confirm: setVerified } = useWalletVerified(address);
  const { applications, state: applicationsState, hasIdentity } = useOwnerApplications();
  const approved = applications.filter((app) => app.status === "approved");
  const [applicationId, setApplicationId] = useState<string | null>(null);
  const application =
    approved.find((app) => app.applicationId === applicationId) ?? approved[0];

  const [selected, setSelected] = useState<Record<string, boolean>>({ "room-1": true });
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [start, setStart] = useState(() => isoDate(Date.now() + DAY_MS));
  const [end, setEnd] = useState(() => isoDate(Date.now() + 91 * DAY_MS));
  const [phase, setPhase] = useState<Phase>("idle");
  const [listingError, setListingError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [published, setPublished] = useState<PublishedRoom[]>([]);

  const rooms = Array.from({ length: application?.rooms ?? 0 }, (_, index) => ({
    id: `room-${index + 1}`,
    name: `Room ${index + 1}`,
  }));
  const chosen = rooms.filter((room) => selected[room.id]);
  const invalidDates = new Date(end) <= new Date(start);
  const total = chosen.reduce(
    (sum, room) => sum + Number(prices[room.id] || 0),
    0,
  );
  const ready =
    connected &&
    verified &&
    Boolean(application) &&
    chosen.length > 0 &&
    !invalidDates &&
    chosen.every((room) => Number(prices[room.id]) > 0);

  const dateLabel = useMemo(() => {
    try {
      return `${formatDate(start)} – ${formatDate(end)}`;
    } catch {
      return "Choose a valid period";
    }
  }, [end, start]);

  /**
   * Publishes the chosen rooms as on-chain listings.
   *
   * The membership proof is generated here, in the owner's browser, so the identity
   * secret never reaches the server. The first proof downloads Semaphore's artifacts
   * and can take a while, which is why the button reports what it is doing.
   */
  const issue = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!ready) return;

    const identity = readIdentity();
    if (!identity || !application) {
      setListingError(
        "This device has no approved owner identity. Submit a property application first.",
      );
      return;
    }

    setPhase("issuing");
    setListingError(null);
    setProgress("Building the membership proof — this can take a moment…");
    const done: PublishedRoom[] = [];

    try {
      for (const room of chosen) {
        const terms = {
          // Scoped to the application, so each room can be listed once per approval.
          room: roomTag(identity.seed, `${application.applicationId}:${room.id}`),
          start: BigInt(Math.floor(new Date(start).getTime() / 1000)),
          end: BigInt(Math.floor(new Date(end).getTime() / 1000)),
          price: BigInt(Math.round(Number(prices[room.id]) * 1e6)),
          payout: address as `0x${string}`,
        };

        setProgress(`Proving approval for ${room.name}…`);
        const proof = await proveListing(terms);

        setProgress(`Issuing the ATS token for ${room.name} on Hedera…`);
        const res = await fetch("/api/listings", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            proof,
            start: Number(terms.start),
            end: Number(terms.end),
            price: terms.price.toString(),
            payout: terms.payout,
            // Public on Arkiv. The city makes a room searchable; the locality stays private.
            city: application.city,
            label: `${room.name} · ${application.city}`,
          }),
        });
        const data = (await res.json()) as {
          ok?: boolean; error?: string; transactionHash?: string;
          listingId?: string; token?: string; indexed?: boolean;
        };
        if (!res.ok || !data.ok) throw new Error(data.error ?? "listing_failed");
        done.push({
          listingId: data.listingId,
          token: data.token,
          transactionHash: data.transactionHash,
          indexed: data.indexed,
          name: room.name,
          price: prices[room.id],
        });
      }

      setPublished(done);
      setPhase("issued");
    } catch (err) {
      // Rooms published before the failure are on-chain, so they must still be shown.
      setPublished(done);
      setListingError(
        `${explainListingError(err)}${done.length ? ` ${done.length} room(s) were already published.` : ""}`,
      );
      if (done.length) setPhase("issued");
      else setPhase("idle");
    } finally {
      setProgress(null);
    }
  };

  if (phase === "issued") {
    return (
      <div className="content-grid">
        <section className="panel">
          <div className="panel__head">
            <h2>Listing created</h2>
            <span className="badge badge--verified">
              <span className="badge__check" aria-hidden="true">
                ✓
              </span>
              Issued on Hedera
            </span>
          </div>
          <div className="panel__body">
            {listingError && (
              <p className="micro" style={{ color: "crimson", marginBottom: 12 }}>
                ● {listingError}
              </p>
            )}
            <div className="notice notice--verified">
              <span className="notice__icon" aria-hidden="true">
                ✓
              </span>
              <div>
                <strong>
                  {published.length} room {published.length === 1 ? "token" : "tokens"} issued · {dateLabel}
                </strong>
                <p>
                  Each room has its own supply-1 ATS token. Its Arkiv listing is searchable
                  now and expires with the rental period.
                </p>
              </div>
            </div>

            <div className="stack-16" style={{ marginTop: 22 }}>
              {published.map((room) => (
                <div className="between panel panel--pad" key={room.listingId ?? room.name}>
                  <div>
                    <strong>{room.name}</strong>
                    <p className="small dim" style={{ marginTop: 4 }}>
                      {formatUsdc(Number(room.price))} USDC · {dateLabel}
                    </p>
                    {room.indexed === false && (
                      <p className="micro" style={{ color: "crimson", marginTop: 4 }}>
                        ● On Hedera, but not indexed on Arkiv, so it may not appear in search.
                      </p>
                    )}
                    {room.token && (
                      <a
                        href={`https://hashscan.io/testnet/contract/${room.token}`}
                        target="_blank"
                        rel="noreferrer"
                        className="mono micro"
                        style={{ display: "block", marginTop: 4 }}
                      >
                        ATS token {room.token.slice(0, 10)}…
                      </a>
                    )}
                    {room.transactionHash && (
                      <a
                        href={`https://hashscan.io/testnet/transaction/${room.transactionHash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="mono micro"
                        style={{ display: "block", marginTop: 2 }}
                      >
                        Transaction {room.transactionHash.slice(0, 10)}…
                      </a>
                    )}
                  </div>
                  {room.listingId && (
                    <Link
                      href={`/marketplace/${room.listingId}`}
                      className="text-link"
                      style={{ fontSize: 11.5 }}
                    >
                      Public listing
                    </Link>
                  )}
                </div>
              ))}
            </div>

            <div className="form-actions">
              <Link href="/owner" className="btn">
                Back to dashboard
              </Link>
              <Link href="/marketplace" className="btn btn--ghost">
                Browse rooms
              </Link>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <form onSubmit={issue}>
      <div className="content-grid">
        <div className="stack-24">
          <section className="panel">
            <div className="panel__head">
              <h2>Property and period</h2>
              {application ? (
                <span className="badge badge--verified">
                  <span className="badge__check" aria-hidden="true">
                    ✓
                  </span>
                  Approved
                </span>
              ) : (
                <span className="badge badge--quiet">Not approved</span>
              )}
            </div>
            <div className="panel__body">
              {!application && (
                <div className="notice notice--brass" style={{ marginBottom: 16 }}>
                  <span className="notice__icon" aria-hidden="true">
                    !
                  </span>
                  <div>
                    <strong>
                      {applicationsState === "loading"
                        ? "Checking your approval…"
                        : applicationsState === "unavailable"
                          ? "Your applications could not be read from Arkiv."
                          : !hasIdentity || applications.length === 0
                            ? "This device has no property application."
                            : applications.some((app) => app.status === "pending")
                              ? "Your property is waiting for the registrar."
                              : "Your application was not approved."}
                    </strong>
                    {applicationsState === "ready" && (
                      <p>
                        Rooms can be listed once the registrar approves a property.{" "}
                        <Link href="/owner/new" className="text-link">
                          Submit a property
                        </Link>
                      </p>
                    )}
                  </div>
                </div>
              )}
              <div className="form-grid">
                <div className="field field--wide">
                  <label htmlFor="property">Approved property</label>
                  <select
                    id="property"
                    value={application?.applicationId ?? ""}
                    disabled={!application}
                    onChange={(event) => setApplicationId(event.target.value)}
                  >
                    {approved.length === 0 && <option value="">None yet</option>}
                    {approved.map((app) => (
                      <option key={app.applicationId} value={app.applicationId}>
                        {app.nickname} · {app.locality}
                      </option>
                    ))}
                  </select>
                  <span className="field__hint">
                    Only registrar-approved properties appear here. The contract also
                    rejects a listing without a valid approval proof.
                  </span>
                </div>
                <div className="field">
                  <label htmlFor="start">Start date</label>
                  <input
                    id="start"
                    type="date"
                    value={start}
                    onChange={(event) => setStart(event.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="end">End date</label>
                  <input
                    id="end"
                    type="date"
                    value={end}
                    onChange={(event) => setEnd(event.target.value)}
                  />
                </div>
              </div>

              {invalidDates && (
                <div className="notice notice--alert" style={{ marginTop: 16 }}>
                  <span className="notice__icon" aria-hidden="true">
                    !
                  </span>
                  <div>
                    <strong>The end date must be after the start date.</strong>
                    <p>The registry rejects zero-length and reversed periods.</p>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="panel">
            <div className="panel__head">
              <h2>Rooms and one-time price</h2>
              <span className="badge badge--quiet">1 token per room</span>
            </div>
            <div className="panel__body">
              <div className="stack-16">
                {rooms.length === 0 && (
                  <p className="small dim">Rooms appear once a property is approved.</p>
                )}
                {rooms.map((room) => (
                  <div
                    className="between wrap"
                    key={room.id}
                    style={{
                      paddingBottom: 14,
                      borderBottom: "1px solid var(--line)",
                    }}
                  >
                    <label className="choice">
                      <input
                        type="checkbox"
                        checked={Boolean(selected[room.id])}
                        onChange={(event) =>
                          setSelected({
                            ...selected,
                            [room.id]: event.target.checked,
                          })
                        }
                      />
                      {room.name}
                    </label>
                    <div className="field" style={{ width: 150 }}>
                      <label htmlFor={`price-${room.id}`}>Price · USDC</label>
                      <input
                        id={`price-${room.id}`}
                        type="number"
                        min="1"
                        value={prices[room.id] ?? ""}
                        onChange={(event) =>
                          setPrices({ ...prices, [room.id]: event.target.value })
                        }
                        disabled={!selected[room.id]}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel__head">
              <h2>Confirm issuance</h2>
              <span className="badge badge--quiet">One ATS token per room</span>
            </div>
            <div className="panel__body">
              {!connected ? (
                <div className="notice notice--brass">
                  <span className="notice__icon" aria-hidden="true">
                    1
                  </span>
                  <div style={{ flex: 1 }}>
                    <strong>Connect the owner wallet.</strong>
                    <p>Sale payments go to this wallet.</p>
                    <button
                      type="button"
                      className="btn btn--small"
                      style={{ marginTop: 12 }}
                      onClick={() => void connect()}
                    >
                      Connect wallet
                    </button>
                  </div>
                </div>
              ) : !verified ? (
                <div className="notice notice--brass">
                  <span className="notice__icon" aria-hidden="true">
                    2
                  </span>
                  <div style={{ flex: 1 }}>
                    <strong>Verify the owner identity.</strong>
                    <p>Verify a unique person with World ID before listing a room.</p>
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
                    <strong>Owner verified.</strong>
                    <p>
                      Each selected room gets its own ATS token on Hedera, then a
                      searchable listing on Arkiv.
                    </p>
                  </div>
                </div>
              )}

              <div className="form-actions">
                <div>
                  {progress && (
                    <p className="micro dim" style={{ marginBottom: 8 }}>
                      {progress}
                    </p>
                  )}
                  {listingError && (
                    <p
                      className="micro"
                      style={{ color: "crimson", marginBottom: 8 }}
                    >
                      ● {listingError}
                    </p>
                  )}
                  <button
                    type="submit"
                    className="btn"
                    disabled={!ready || phase === "issuing"}
                  >
                    {phase === "issuing"
                      ? (progress ?? "Publishing…")
                      : `Issue ${chosen.length} room ${chosen.length === 1 ? "token" : "tokens"}`}
                  </button>
                  {!ready && phase === "idle" && (
                    <p className="form-lock" style={{ marginTop: 10 }}>
                      <span aria-hidden="true">●</span>
                      {!connected
                        ? "Connect a wallet to continue."
                        : !verified
                          ? "Verify your identity to issue tokens."
                          : !application
                            ? "A registrar-approved property is required."
                            : chosen.length === 0
                              ? "Select at least one room."
                              : "Complete the price and date fields."}
                    </p>
                  )}
                </div>
                <p className="form-actions__note">
                  Each room is confirmed only after its Hedera transaction succeeds.
                  Listing several rooms sends one transaction per room.
                </p>
              </div>
            </div>
          </section>
        </div>

        <aside className="stack-16">
          <section className="panel panel--pad">
            <p className="eyebrow">Preview</p>
            <h2 className="subtitle" style={{ marginTop: 10 }}>
              {application?.nickname ?? "No approved property"}
            </h2>
            <p className="small dim" style={{ marginTop: 4 }}>
              {dateLabel}
            </p>

            <div className="buy-panel__list" style={{ marginTop: 16 }}>
              {chosen.map((room) => (
                <div key={room.id}>
                  <span>{room.name}</span>
                  <span className="mono">
                    {formatUsdc(Number(prices[room.id] || 0))} USDC
                  </span>
                </div>
              ))}
              <div>
                <span>Total</span>
                <span className="mono">{formatUsdc(total)} USDC</span>
              </div>
            </div>

            {verified && <VerifyBadge label="Owner verified" />}

            <p className="buy-panel__note">
              The broker pays this amount once for the full period. Tenant rent
              and deposit are arranged separately with the broker.
            </p>
          </section>

          <section className="panel panel--pad">
            <p className="eyebrow">Contract checks</p>
            <div className="timeline" style={{ marginTop: 12 }}>
              <div className="timeline__item" data-done={Boolean(application)}>
                <span className="timeline__dot" />
                <div>
                  <strong>Property approved</strong>
                  <span>Registrar-approved commitment on Hedera</span>
                </div>
              </div>
              <div className="timeline__item" data-done={verified}>
                <span className="timeline__dot" />
                <div>
                  <strong>Owner verified</strong>
                  <span>One person, one wallet, via World ID</span>
                </div>
              </div>
              <div className="timeline__item" data-done={!invalidDates}>
                <span className="timeline__dot" />
                <div>
                  <strong>Valid period</strong>
                  <span>The end date must follow the start date</span>
                </div>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </form>
  );
}
