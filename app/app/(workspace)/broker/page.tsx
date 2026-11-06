import type { Metadata } from "next";
import Link from "next/link";
import { BrokerVerification } from "@/components/workspace/broker-verification";
import { BrokerHistory } from "@/components/workspace/broker-history";
import { BrokerMetrics } from "@/components/workspace/broker-metrics";
import { BrokerRights } from "@/components/workspace/broker-rights";
import { BrokerDoorQr } from "@/components/workspace/broker-door-qr";
import {
  demo,
} from "@/lib/data";

export const metadata: Metadata = {
  title: "Broker workspace",
};

export default function BrokerPage() {

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
            href={`/verify/${demo.propertyId}`}
            className="btn btn--small btn--ghost"
          >
            Public verify page
          </Link>
        </div>
      </div>

      <BrokerMetrics />

      <div style={{ marginTop: 24 }}>
        <BrokerVerification />
      </div>

      <div className="content-grid">
        <div className="stack-24">
          <BrokerRights />

          <section className="panel">
            <div className="panel__head">
              <h2>Transaction history</h2>
              <span className="badge badge--quiet">Hedera testnet</span>
            </div>
            <BrokerHistory />
          </section>
        </div>

        <aside className="stack-16">
          <section className="panel panel--pad">
            <p className="eyebrow">Show this at the door</p>
            <div style={{ marginTop: 14 }}>
              <BrokerDoorQr />
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
                  <span>Fresh session proof at each viewing</span>
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
