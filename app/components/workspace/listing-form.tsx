"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useWallet } from "@/components/providers";
import { VerifyBadge } from "@/components/ui/verify-badge";
import { WorldIdButton } from "@/components/ui/world-id-button";
import {
  demo,
  formatDate,
  formatUsdc,
  property,
  rooms,
} from "@/lib/data";

type Phase = "idle" | "issuing" | "issued";

const overlapsActive = (start: string, end: string) =>
  new Date(start) <= new Date("2027-03-31") &&
  new Date(end) >= new Date("2027-01-01");

export function ListingForm() {
  const { connected, connect } = useWallet();
  const [verified, setVerified] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({
    r1: true,
    r2: true,
    r3: true,
  });
  const [prices, setPrices] = useState<Record<string, string>>({
    r1: "850",
    r2: "980",
    r3: "820",
  });
  const [start, setStart] = useState("2027-04-01");
  const [end, setEnd] = useState("2027-06-30");
  const [phase, setPhase] = useState<Phase>("idle");

  const chosen = rooms.filter((room) => selected[room.id]);
  const overlap = overlapsActive(start, end) && chosen.length > 0;
  const invalidDates = new Date(end) <= new Date(start);
  const total = chosen.reduce(
    (sum, room) => sum + Number(prices[room.id] || 0),
    0,
  );
  const ready =
    connected &&
    verified &&
    chosen.length > 0 &&
    !overlap &&
    !invalidDates &&
    chosen.every((room) => Number(prices[room.id]) > 0);

  const dateLabel = useMemo(() => {
    try {
      return `${formatDate(start)} – ${formatDate(end)}`;
    } catch {
      return "Choose a valid period";
    }
  }, [end, start]);

  const issue = (event: React.FormEvent) => {
    event.preventDefault();
    if (!ready) return;
    setPhase("issuing");
    window.setTimeout(() => setPhase("issued"), 1800);
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
            <div className="notice notice--verified">
              <span className="notice__icon" aria-hidden="true">
                ✓
              </span>
              <div>
                <strong>
                  {chosen.length} room tokens minted · {dateLabel}
                </strong>
                <p>
                  Each room has its own supply-1 token and an Arkiv listing that
                  expires with the period. The public page is live for each room.
                </p>
              </div>
            </div>

            <div className="detail-meta" style={{ marginTop: 22 }}>
              <div>
                <span className="micro">Total one-time value</span>
                <strong>{formatUsdc(total)} USDC</strong>
              </div>
              <div>
                <span className="micro">Room tokens</span>
                <strong>{chosen.length}</strong>
              </div>
              <div>
                <span className="micro">Listing transaction</span>
                <strong className="mono" style={{ fontSize: 10 }}>
                  0.0.5941282@1778…945
                </strong>
              </div>
              <div>
                <span className="micro">Approved-set root</span>
                <strong className="mono">{demo.propertyRoot} · v{demo.rootVersion}</strong>
              </div>
            </div>

            <div className="stack-16" style={{ marginTop: 22 }}>
              {chosen.map((room) => (
                <div className="between panel panel--pad" key={room.id}>
                  <div>
                    <strong>{room.name}</strong>
                    <p className="small dim" style={{ marginTop: 4 }}>
                      {formatUsdc(Number(prices[room.id]))} USDC · {dateLabel}
                    </p>
                  </div>
                  <Link
                    href={`/marketplace/${room.id}`}
                    className="text-link"
                    style={{ fontSize: 11.5 }}
                  >
                    Public listing
                  </Link>
                </div>
              ))}
            </div>

            <div className="form-actions">
              <Link href="/owner" className="btn">
                Back to dashboard
              </Link>
              <Link href="/verify/rmo-3b-andheri?room=r2" className="btn btn--ghost">
                Open verification page
              </Link>
            </div>
          </div>
        </section>

        <aside className="panel panel--pad">
          <p className="eyebrow">QR + verification</p>
          <p className="small" style={{ marginTop: 10, color: "rgba(22,35,59,.68)" }}>
            Every room gets a public link and QR. The tenant page confirms the
            holder against Hedera and can run a fresh presence check.
          </p>
          <p className="mono" style={{ marginTop: 14, fontSize: 10.5, wordBreak: "break-all" }}>
            rentmeout.xyz/verify/rmo-3b-andheri?room=r2
          </p>
        </aside>
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
              <span className="badge badge--verified">
                <span className="badge__check" aria-hidden="true">
                  ✓
                </span>
                Approved
              </span>
            </div>
            <div className="panel__body">
              <div className="form-grid">
                <div className="field field--wide">
                  <label htmlFor="property">Approved property</label>
                  <select id="property" defaultValue={property.id}>
                    <option value={property.id}>
                      {property.nickname} · {property.locality}
                    </option>
                  </select>
                  <span className="field__hint">
                    Unapproved properties cannot be selected. The contract also
                    blocks them if the UI is bypassed.
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

              {overlap && (
                <div className="notice notice--alert" style={{ marginTop: 16 }}>
                  <span className="notice__icon" aria-hidden="true">
                    !
                  </span>
                  <div>
                    <strong>Rooms already listed for part of this period.</strong>
                    <p>
                      Room 2 is sold for Jan – Mar 2027 and the other rooms have
                      an active listing. Pick a non-overlapping period, such as
                      1 Apr – 30 Jun 2027.
                    </p>
                  </div>
                </div>
              )}
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
                {rooms.map((room, index) => (
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
                        checked={selected[room.id]}
                        onChange={(event) =>
                          setSelected({
                            ...selected,
                            [room.id]: event.target.checked,
                          })
                        }
                      />
                      Room {index + 1} · {room.name.split("·")[1]?.trim()}
                    </label>
                    <div className="field" style={{ width: 150 }}>
                      <label htmlFor={`price-${room.id}`}>Price · USDC</label>
                      <input
                        id={`price-${room.id}`}
                        type="number"
                        min="1"
                        value={prices[room.id]}
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
              <span className="badge badge--quiet">Wallet prompt follows</span>
            </div>
            <div className="panel__body">
              {!connected ? (
                <div className="notice notice--brass">
                  <span className="notice__icon" aria-hidden="true">
                    1
                  </span>
                  <div style={{ flex: 1 }}>
                    <strong>Connect the owner wallet.</strong>
                    <p>Only the verified owner wallet can issue these tokens.</p>
                    <button
                      type="button"
                      className="btn btn--small"
                      style={{ marginTop: 12 }}
                      onClick={connect}
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
                    <p>
                      The owner wallet must be on the ATS allowlist before a mint
                      can succeed.
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
                    <strong>Owner verified and allowlisted.</strong>
                    <p>
                      The issuer will mint one token per selected room and write
                      the matching Arkiv listing after both confirm.
                    </p>
                  </div>
                </div>
              )}

              <div className="form-actions">
                <div>
                  <button
                    type="submit"
                    className="btn"
                    disabled={!ready || phase === "issuing"}
                  >
                    {phase === "issuing"
                      ? "Minting room tokens…"
                      : `Issue ${chosen.length} room ${chosen.length === 1 ? "token" : "tokens"}`}
                  </button>
                  {!ready && phase === "idle" && (
                    <p className="form-lock" style={{ marginTop: 10 }}>
                      <span aria-hidden="true">●</span>
                      {!connected
                        ? "Connect a wallet to continue."
                        : !verified
                          ? "Verify your identity to issue tokens."
                          : chosen.length === 0
                            ? "Select at least one room."
                            : overlap
                              ? "Choose a non-overlapping period."
                              : "Complete the price and date fields."}
                    </p>
                  )}
                </div>
                <p className="form-actions__note">
                  Confirmation is shown only after the mint and the index write
                  both succeed. A pending transaction is never shown as complete.
                </p>
              </div>
            </div>
          </section>
        </div>

        <aside className="stack-16">
          <section className="panel panel--pad">
            <p className="eyebrow">Preview</p>
            <h2 className="subtitle" style={{ marginTop: 10 }}>
              {property.nickname}
            </h2>
            <p className="small dim" style={{ marginTop: 4 }}>
              {dateLabel}
            </p>

            <div className="buy-panel__list" style={{ marginTop: 16 }}>
              {chosen.map((room) => (
                <div key={room.id}>
                  <span>Room {rooms.findIndex((entry) => entry.id === room.id) + 1}</span>
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
              <div className="timeline__item" data-done="true">
                <span className="timeline__dot" />
                <div>
                  <strong>Property approved</strong>
                  <span>Registrar-approved commitment on Hedera</span>
                </div>
              </div>
              <div className="timeline__item" data-done={!overlap}>
                <span className="timeline__dot" />
                <div>
                  <strong>No overlap</strong>
                  <span>Same room cannot have two active periods</span>
                </div>
              </div>
              <div className="timeline__item" data-done={Boolean(ready)}>
                <span className="timeline__dot" />
                <div>
                  <strong>Owner allowlisted</strong>
                  <span>ATS mint target must be eligible</span>
                </div>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </form>
  );
}
