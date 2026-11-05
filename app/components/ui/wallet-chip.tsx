"use client";

import { useWallet } from "@/components/providers";
import { demo } from "@/lib/data";

export function WalletChip({ compact = false }: { compact?: boolean }) {
  const { connected, shortAddress, connect, disconnect } = useWallet();

  if (!connected) {
    return (
      <button type="button" className="btn btn--small" onClick={connect}>
        Connect wallet
      </button>
    );
  }

  return (
    <button
      type="button"
      className="wallet-chip"
      onClick={disconnect}
      title="Disconnect demo wallet"
    >
      <span className="wallet-chip__dot" aria-hidden="true" />
      <span className="mono">{shortAddress}</span>
      {!compact && (
        <span className="wallet-chip__network">{demo.network}</span>
      )}
    </button>
  );
}
