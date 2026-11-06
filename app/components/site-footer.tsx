import Link from "next/link";

export function SiteFooter() {
  const registry = process.env.NEXT_PUBLIC_RENTAL_REGISTRY_ADDRESS;

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
            <Link href="/verify/rmo-3b-andheri">Verify a room</Link>
            <span className="mono">World ID · session proof</span>
          </div>

          <div className="footer-col">
            <h3>On-chain / index</h3>
            {registry && (
              <a
                href={`https://hashscan.io/testnet/contract/${registry}`}
                target="_blank"
                rel="noreferrer"
              >
                HashScan · RentalRegistry
              </a>
            )}
            <span className="mono">Hedera testnet · Arkiv Rabdi</span>
          </div>
        </div>

        <div className="footer-bottom">
          <span>ETHGlobal Mumbai 2026 · testnet demo</span>
          <span>
            Rent Me Out verifies recorded rental rights and identity match. It
            is not a title guarantee.
          </span>
        </div>
      </div>
    </footer>
  );
}
