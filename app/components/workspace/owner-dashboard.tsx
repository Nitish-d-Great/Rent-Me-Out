"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useWallet } from "@/components/providers";
import { StatusStamp } from "@/components/ui/status-stamp";
import { OwnerProperties } from "@/components/workspace/owner-properties";
import { OwnerVerification } from "@/components/workspace/owner-verification";
import { useLiveRooms } from "@/lib/chain/use-live-rooms";
import { useOwnerApplications } from "@/lib/chain/use-owner";
import { formatDate, formatUsdc, periodLabel } from "@/lib/data";

interface Purchase {
  listingId: string;
  payout: string;
  price: string;
  transactionHash: string;
}

const short = (value: string) => `${value.slice(0, 6)}…${value.slice(-4)}`;
const VERIFY_BASE = "/verify/rmo-3b-andheri";

/**
 * The owner's own data: applications found through this device's identity, listings
 * whose payout is the connected wallet, and sales from the registry's event log.
 */
export function OwnerDashboard() {
  const { address, connected, connect } = useWallet();
  const { applications, state } = useOwnerApplications();
  const { rooms, status } = useLiveRooms();
  const [purchases, setPurchases] = useState<Purchase[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/purchases");
        if (!res.ok) return;
        const data = (await res.json()) as { purchases: Purchase[] };
        if (!cancelled) setPurchases(data.purchases);
      } catch {
        // The table below simply stays empty; listings and states still come from the chain.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const wallet = address?.toLowerCase();
  const mine = (rooms ?? []).filter((room) => room.payout?.toLowerCase() === wallet);
  const sales = purchases.filter((sale) => sale.payout.toLowerCase() === wallet);
  const received = sales.reduce((sum, sale) => sum + Number(sale.price), 0);
  const inReview = applications.filter((app) => app.status === "pending");
  const next = inReview[0];

  return (
    <>
      <div className="metric-row">
        <div className="metric">
          <div className="metric__label">Rooms listed</div>
          <div className="metric__value">{mine.length}</div>
        </div>
        <div className="metric">
          <div className="metric__label">Rights sold</div>
          <div className="metric__value">{sales.length}</div>
        </div>
        <div className="metric">
          <div className="metric__label">Received</div>
          <div className="metric__value">
            {formatUsdc(received)} <small>USDC</small>
          </div>
        </div>
        <div className="metric">
          <div className="metric__label">In review</div>
          <div className="metric__value">{inReview.length}</div>
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        <OwnerVerification />
      </div>

      <div className="content-grid">
        <div className="stack-24">
          <OwnerProperties properties={applications} loading={state === "loading"} />

          <section className="panel" id="sales">
            <div className="panel__head">
              <h2>My listings</h2>
              <span className="badge badge--quiet">Hedera testnet</span>
            </div>
            <div className="panel__body panel__body--flush">
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Room</th>
                      <th>Period</th>
                      <th>Price</th>
                      <th>State</th>
                      <th>Holder</th>
                      <th>ATS token</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {mine.length === 0 && (
                      <tr>
                        <td colSpan={7} className="dim micro">
                          {!connected ? (
                            <button type="button" className="linklike" onClick={() => void connect()}>
                              Connect the owner wallet to see your listings.
                            </button>
                          ) : status === "loading" ? (
                            "Reading listings from Hedera…"
                          ) : status === "unavailable" ? (
                            "The registry is unreachable, so listings cannot be shown."
                          ) : (
                            "This wallet has no listings yet."
                          )}
                        </td>
                      </tr>
                    )}
                    {mine.map((room) => (
                      <tr key={room.id}>
                        <td><strong>{room.name}</strong></td>
                        <td>{periodLabel(room)}</td>
                        <td className="mono">{formatUsdc(room.price)} USDC</td>
                        <td><StatusStamp state={room.state} /></td>
                        <td className="mono">{room.holder ? short(room.holder) : "—"}</td>
                        <td className="mono">
                          {room.tokenAddress ? (
                            <a
                              href={`https://hashscan.io/testnet/contract/${room.tokenAddress}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {room.tokenId}
                            </a>
                          ) : "—"}
                        </td>
                        <td>
                          <Link
                            href={`${VERIFY_BASE}?room=${room.id}`}
                            className="text-link"
                            style={{ fontSize: 10.5 }}
                          >
                            Verify
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel__head">
              <h2>Sales</h2>
              <span className="badge badge--quiet">From the registry&apos;s event log</span>
            </div>
            <div className="panel__body panel__body--flush">
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Room</th>
                      <th>Received</th>
                      <th>Transaction</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sales.length === 0 && (
                      <tr>
                        <td colSpan={3} className="dim micro">No sales yet.</td>
                      </tr>
                    )}
                    {sales.map((sale) => (
                      <tr key={sale.transactionHash}>
                        <td><strong>Room {sale.listingId}</strong></td>
                        <td className="mono">{sale.price} USDC</td>
                        <td className="mono">
                          <a
                            href={`https://hashscan.io/testnet/transaction/${sale.transactionHash}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {sale.transactionHash.slice(0, 14)}…
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </div>

        <aside className="stack-16">
          <section className="panel panel--pad">
            <p className="eyebrow">Next action</p>
            {next ? (
              <>
                <h2 className="subtitle" style={{ marginTop: 12 }}>
                  {next.nickname} is waiting for the registrar.
                </h2>
                <p className="small dim" style={{ marginTop: 8 }}>
                  Submitted {formatDate(next.submittedAt.slice(0, 10))}. No rooms can be
                  listed until it is approved on Hedera.
                </p>
              </>
            ) : applications.some((app) => app.status === "approved") ? (
              <>
                <h2 className="subtitle" style={{ marginTop: 12 }}>
                  Your property is approved.
                </h2>
                <Link
                  href="/owner/listings/new"
                  className="btn btn--small btn--wide"
                  style={{ marginTop: 12 }}
                >
                  Create a listing
                </Link>
              </>
            ) : (
              <>
                <h2 className="subtitle" style={{ marginTop: 12 }}>
                  Submit your first property.
                </h2>
                <Link
                  href="/owner/new"
                  className="btn btn--small btn--wide"
                  style={{ marginTop: 12 }}
                >
                  Submit property
                </Link>
              </>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
