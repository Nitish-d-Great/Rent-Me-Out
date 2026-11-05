import type { Metadata } from "next";
import Link from "next/link";
import { BrokerVerification } from "@/components/workspace/broker-verification";
import { QRPanel } from "@/components/ui/qr-panel";
import { StatusStamp } from "@/components/ui/status-stamp";
import { VerifyBadge } from "@/components/ui/verify-badge";
import {
  brokerRights,
  demo,
  formatDate,
  formatUsdc,
  rooms,
} from "@/lib/data";

export const metadata: Metadata = {
  title: "Broker workspace",
};

export default function BrokerPage() {
  const room = rooms[1];

  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">Broker workspace</p>
          <h1>One room. One holder. You.</h1>
          <p>
            Browse verified room rights, pay the owner once, and prove at the
            viewing that the person present is the holder on Hedera.
          </p>
        </div>
        <div className="page-head__actions">
          <Link href="/marketplace" className="btn btn--small">
            Browse rooms
          </Link>
          <Link
            href={`/verify/${demo.propertyId}?room=r2`}
            className="btn btn--small btn--ghost"
          >
            Public verify page
          </Link>
        </div>
      </div>

      <div className="metric-row">
        <div className="metric">
          <div className="metric__label">Rights held</div>
          <div className="metric__value">
            1 <small>Room 2</small>
          </div>
        </div>
        <div className="metric">
          <div className="metric__label">Paid</div>
          <div className="metric__value">
            980 <small>USDC</small>
          </div>
        </div>
        <div className="metric">
          <div className="metric__label">Valid until</div>
          <div className="metric__value" style={{ fontSize: 18 }}>
            {formatDate(demo.periodEnd)}
          </div>
        </div>
        <div className="metric">
          <div className="metric__label">Presence checks</div>
          <div className="metric__value">
            0 <small>this session</small>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        <BrokerVerification />
      </div>

      <div className="content-grid">
        <div className="stack-24">
          <section className="panel" id="rights">
            <div className="panel__head">
              <h2>Room 2 · Ashoka Residency</h2>
              <StatusStamp state="held" />
            </div>
            <div className="panel__body">
              <div className="between wrap" style={{ alignItems: "flex-start" }}>
                <div>
                  <p className="eyebrow">Rights held</p>
                  <h2 className="subtitle" style={{ marginTop: 10 }}>
                    {demo.periodLabel}
                  </h2>
                  <p className="small dim" style={{ marginTop: 6 }}>
                    Balcony room · {room.note}
                  </p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="mono" style={{ fontSize: 20 }}>
                    {formatUsdc(room.price)} USDC
                  </div>
                  <p className="micro dim" style={{ marginTop: 4 }}>
                    paid once · no refunds
                  </p>
                </div>
              </div>

              <div className="detail-meta" style={{ marginTop: 22 }}>
                <div>
                  <span className="micro">Token</span>
                  <strong className="mono">{room.tokenId}</strong>
                </div>
                <div>
                  <span className="micro">Holder</span>
                  <strong className="mono">{demo.brokerShort}</strong>
                </div>
                <div>
                  <span className="micro">Valid from</span>
                  <strong>{formatDate(demo.periodStart)}</strong>
                </div>
                <div>
                  <span className="micro">Valid until</span>
                  <strong>{formatDate(demo.periodEnd)}</strong>
                </div>
              </div>

              <div className="between wrap" style={{ marginTop: 18 }}>
                <VerifyBadge label="Verified holder" />
                <a
                  href={`https://hashscan.io/testnet/transaction/${demo.purchaseTx}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-link"
                  style={{ fontSize: 11.5 }}
                >
                  Purchase on HashScan
                </a>
              </div>

              <div className="notice notice--brass" style={{ marginTop: 20 }}>
                <span className="notice__icon" aria-hidden="true">
                  i
                </span>
                <div>
                  <strong>This right is not a lease.</strong>
                  <p>
                    Tenant rent, deposit, maintenance and lease terms stay
                    between you and the tenant. At expiry the token is burned and
                    this page shows no current holder.
                  </p>
                </div>
              </div>

              <div className="form-actions">
                <Link
                  href={`/verify/${demo.propertyId}?room=r2`}
                  className="btn"
                >
                  Prove I&apos;m the holder
                </Link>
                <Link href="/marketplace" className="btn btn--ghost">
                  Find another room
                </Link>
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel__head">
              <h2>Transaction history</h2>
              <span className="badge badge--quiet">Hedera testnet</span>
            </div>
            <div className="panel__body panel__body--flush">
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Rights</th>
                      <th>Reference</th>
                      <th>Date</th>
                      <th>Amount</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {brokerRights.map((right) => (
                      <tr key={right.id}>
                        <td>
                          <strong>{right.type}</strong>
                          <div className="dim" style={{ fontSize: 10 }}>
                            {right.detail}
                          </div>
                        </td>
                        <td className="mono">{right.id.slice(0, 22)}…</td>
                        <td>{formatDate(right.date)}</td>
                        <td className="mono">980 USDC</td>
                        <td>
                          <span className="badge badge--verified">
                            <span className="badge__check" aria-hidden="true">
                              ✓
                            </span>
                            Confirmed
                          </span>
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
            <p className="eyebrow">Show this at the door</p>
            <div style={{ marginTop: 14 }}>
              <QRPanel
                value="https://rentmeout.xyz/verify/rmo-3b-andheri?room=r2"
                title="Room 2 verification"
                note="The tenant scans this, sees your holder wallet, and can run a fresh World ID presence check."
              />
            </div>
          </section>

          <section className="panel panel--pad">
            <p className="eyebrow">Presence check</p>
            <div className="timeline" style={{ marginTop: 12 }}>
              <div className="timeline__item" data-done="true">
                <span className="timeline__dot" />
                <div>
                  <strong>Tenant creates a session</strong>
                  <span>Short-lived nonce · Room 2</span>
                </div>
              </div>
              <div className="timeline__item">
                <span className="timeline__dot" />
                <div>
                  <strong>You complete World ID</strong>
                  <span>Fresh broker-presence action</span>
                </div>
              </div>
              <div className="timeline__item">
                <span className="timeline__dot" />
                <div>
                  <strong>Server compares to holder</strong>
                  <span>Green match or red mismatch only</span>
                </div>
              </div>
            </div>
            <p className="buy-panel__note">
              The check proves the person present matches the current holder
              binding. It does not reveal your ID document.
            </p>
          </section>
        </aside>
      </div>
    </>
  );
}
