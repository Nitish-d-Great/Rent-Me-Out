"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@/components/providers";

/**
 * The broker's purchases, read from RoomPurchased events rather than a local list, so
 * the history cannot disagree with the chain.
 *
 * With no wallet connected it shows every purchase the registry has seen: the log is
 * public, and an empty table would read as "you have bought nothing" rather than
 * "nobody is connected".
 */

interface Purchase {
  listingId: string;
  broker: string;
  payout: string;
  price: string;
  transactionHash: string;
}

export function BrokerHistory() {
  const { address } = useWallet();
  const [purchases, setPurchases] = useState<Purchase[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const query = address ? `?broker=${address}` : "";
        const res = await fetch(`/api/purchases${query}`);
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { purchases: Purchase[] };
        if (!cancelled) setPurchases(data.purchases);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, [address]);

  if (failed) {
    return (
      <div className="panel__body">
        <p className="micro" style={{ color: "crimson" }}>
          ● Could not read purchase history from the registry.
        </p>
      </div>
    );
  }

  if (!purchases) {
    return (
      <div className="panel__body">
        <p className="dim micro">Reading purchases from Hedera…</p>
      </div>
    );
  }

  if (purchases.length === 0) {
    return (
      <div className="panel__body">
        <p className="dim micro">
          {address
            ? "This wallet has not bought any room rights yet."
            : "No purchases recorded yet."}
        </p>
      </div>
    );
  }

  return (
    <div className="panel__body panel__body--flush">
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Rights</th>
              <th>Transaction</th>
              <th>Paid to</th>
              <th>Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {purchases.map((purchase) => (
              <tr key={purchase.transactionHash}>
                <td>
                  <strong>Room {purchase.listingId}</strong>
                  <div className="dim" style={{ fontSize: 10 }}>
                    Listing #{purchase.listingId}
                  </div>
                </td>
                <td className="mono">
                  <a
                    href={`https://hashscan.io/testnet/transaction/${purchase.transactionHash}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {purchase.transactionHash.slice(0, 18)}…
                  </a>
                </td>
                <td className="mono">
                  {purchase.payout.slice(0, 6)}…{purchase.payout.slice(-4)}
                </td>
                <td className="mono">{purchase.price} dUSDC</td>
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
  );
}
