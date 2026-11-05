import type { Metadata } from "next";
import Link from "next/link";
import { OwnerProperties } from "@/components/workspace/owner-properties";
import { OwnerVerification } from "@/components/workspace/owner-verification";
import { StatusStamp } from "@/components/ui/status-stamp";
import {
  demo,
  formatDate,
  formatUsdc,
  ownerProperties,
  ownerTransactions,
  property,
  rooms,
} from "@/lib/data";

export const metadata: Metadata = {
  title: "Owner workspace",
};

export default function OwnerPage() {
  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">Owner workspace</p>
          <h1>Your properties and room rights.</h1>
          <p>
            Submit a deed, wait for registrar approval, then list individual
            rooms for a fixed period. One room right is one token.
          </p>
        </div>
        <div className="page-head__actions">
          <Link href="/owner/new" className="btn btn--small">
            Submit property
          </Link>
          <Link href="/owner/listings/new" className="btn btn--small btn--ghost">
            Create listing
          </Link>
        </div>
      </div>

      <div className="metric-row">
        <div className="metric">
          <div className="metric__label">Rooms listed</div>
          <div className="metric__value">
            3 <small>one per room</small>
          </div>
        </div>
        <div className="metric">
          <div className="metric__label">Rights sold</div>
          <div className="metric__value">
            1 <small>Room 2</small>
          </div>
        </div>
        <div className="metric">
          <div className="metric__label">Received</div>
          <div className="metric__value">
            980 <small>USDC</small>
          </div>
        </div>
        <div className="metric">
          <div className="metric__label">In review</div>
          <div className="metric__value">
            1 <small>Bandra studio</small>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        <OwnerVerification />
      </div>

      <div className="content-grid">
        <div className="stack-24">
          <OwnerProperties properties={ownerProperties} />

          <section className="panel" id="sales">
            <div className="panel__head">
              <h2>Current listing · {property.nickname}</h2>
              <span className="badge badge--brass">{demo.periodLabel}</span>
            </div>
            <div className="panel__body panel__body--flush">
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Room</th>
                      <th>Price</th>
                      <th>State</th>
                      <th>Holder</th>
                      <th>Token</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {rooms.map((room, index) => (
                      <tr key={room.id}>
                        <td>
                          <strong>Room {index + 1}</strong>
                          <div className="dim" style={{ fontSize: 10 }}>
                            {room.name.split("·")[1]?.trim()}
                          </div>
                        </td>
                        <td className="mono">{formatUsdc(room.price)} USDC</td>
                        <td>
                          <StatusStamp state={room.state} />
                        </td>
                        <td className="mono">
                          {room.holder ? demo.brokerShort : "—"}
                        </td>
                        <td className="mono">{room.tokenId}</td>
                        <td>
                          {room.state === "held" ? (
                            <Link
                              href={`/verify/${demo.propertyId}?room=${room.id}`}
                              className="text-link"
                              style={{ fontSize: 10.5 }}
                            >
                              Verify
                            </Link>
                          ) : (
                            <span className="dim" style={{ fontSize: 10.5 }}>
                              Listed
                            </span>
                          )}
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
              <h2>Transactions</h2>
              <span className="badge badge--quiet">Hedera testnet</span>
            </div>
            <div className="panel__body panel__body--flush">
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Event</th>
                      <th>Reference</th>
                      <th>Date</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ownerTransactions.map((transaction) => (
                      <tr key={transaction.id}>
                        <td>
                          <strong>{transaction.type}</strong>
                          <div className="dim" style={{ fontSize: 10 }}>
                            {transaction.detail}
                          </div>
                        </td>
                        <td className="mono">{transaction.id.slice(0, 22)}…</td>
                        <td>{formatDate(transaction.date)}</td>
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
            <p className="eyebrow">Next action</p>
            <h2 className="subtitle" style={{ marginTop: 12 }}>
              Bandra studio is waiting for the registrar.
            </h2>
            <p className="small dim" style={{ marginTop: 8 }}>
              The deed was uploaded on 2 Nov. No listing can be created until
              the property is approved on Hedera.
            </p>
            <div className="timeline" style={{ marginTop: 18 }}>
              <div className="timeline__item" data-done="true">
                <span className="timeline__dot" />
                <div>
                  <strong>World ID verified</strong>
                  <span>Wallet bound to nullifier</span>
                </div>
              </div>
              <div className="timeline__item" data-done="true">
                <span className="timeline__dot" />
                <div>
                  <strong>Deed encrypted + uploaded</strong>
                  <span>Swarm · registrar-only decrypt</span>
                </div>
              </div>
              <div className="timeline__item">
                <span className="timeline__dot" />
                <div>
                  <strong>Registrar review</strong>
                  <span>Pending · usually under 24h</span>
                </div>
              </div>
              <div className="timeline__item">
                <span className="timeline__dot" />
                <div>
                  <strong>Listing opens</strong>
                  <span>Create one token per room</span>
                </div>
              </div>
            </div>
          </section>

          <section className="panel panel--pad">
            <p className="eyebrow">Period at a glance</p>
            <div className="buy-panel__list" style={{ marginTop: 12 }}>
              <div>
                <span>Period</span>
                <span>{demo.periodLabel}</span>
              </div>
              <div>
                <span>Listed</span>
                <span>3 rooms</span>
              </div>
              <div>
                <span>Sold</span>
                <span>1 · Room 2</span>
              </div>
              <div>
                <span>Expires</span>
                <span>{formatDate(demo.periodEnd)}</span>
              </div>
            </div>
            <Link
              href={`/verify/${demo.propertyId}?room=r2`}
              className="btn btn--ghost btn--wide btn--small"
            >
              Open public page
            </Link>
          </section>
        </aside>
      </div>
    </>
  );
}
