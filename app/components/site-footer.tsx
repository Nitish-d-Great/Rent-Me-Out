import Link from "next/link";
import { demo } from "@/lib/data";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="shell">
        <div className="footer-grid">
          <div className="footer-brand">
            <Link href="/" className="brand" style={{ color: "var(--paper)" }}>
              <span className="brand__mark" aria-hidden="true" />
              Rent Me Out
            </Link>
            <p>
              Time-bound rental rights for one room. Verified by a registrar,
              held by one broker, checkable by anyone.
            </p>
          </div>

          <div className="footer-col">
            <h3>Product</h3>
            <Link href="/marketplace">Browse rooms</Link>
            <Link href="/owner">Owner workspace</Link>
            <Link href="/broker">Broker workspace</Link>
            <Link href="/registrar">Registrar console</Link>
          </div>

          <div className="footer-col">
            <h3>Verify</h3>
            <Link href="/verify/rmo-3b-andheri?room=r2">Room 2 · Ashoka Residency</Link>
            <Link href="/verify/rmo-3b-andheri?room=r2&state=frozen">
              Frozen state example
            </Link>
            <Link href="/verify/rmo-3b-andheri?room=r1">Available room example</Link>
            <span className="mono">World ID · broker-presence</span>
          </div>

          <div className="footer-col">
            <h3>On-chain / index</h3>
            <a
              href={`https://hashscan.io/testnet/transaction/${demo.purchaseTx}`}
              target="_blank"
              rel="noreferrer"
            >
              HashScan · sample purchase
            </a>
            <a
              href={`https://hashscan.io/testnet/token/${roomsToken()}`}
              target="_blank"
              rel="noreferrer"
            >
              HashScan · room 2 token
            </a>
            <span className="mono">arkiv:0x4d2a…8f10 · root v12</span>
            <span className="mono">wallet: 0x9f21…7c04</span>
          </div>
        </div>

        <div className="footer-bottom">
          <span>ETHGlobal Mumbai 2026 · testnet demo · sample data</span>
          <span>
            Rent Me Out verifies recorded rental rights and identity match. It
            is not a title guarantee.
          </span>
        </div>
      </div>
    </footer>
  );
}

function roomsToken() {
  return "0.0.5941281";
}
