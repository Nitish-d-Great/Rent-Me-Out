"use client";

import { useWallet } from "@/components/providers";
import { demo } from "@/lib/data";

export function WalletChip({ compact = false }: { compact?: boolean }) {
  const {
    connected,
    shortAddress,
    isInjected,
    wrongNetwork,
    connecting,
    error,
    connect,
    disconnect,
    switchNetwork,
  } = useWallet();

  if (!connected) {
    return (
      <span className="flex gap-8" style={{ alignItems: "center" }}>
        <button
          type="button"
          className="btn btn--small"
          disabled={connecting}
          onClick={() => void connect()}
        >
          {connecting ? "Connecting…" : "Connect wallet"}
        </button>
        {error && <span className="micro" style={{ color: "crimson" }}>{error}</span>}
      </span>
    );
  }

  // A real wallet on the wrong chain is worth interrupting for: anything the user
  // signs would go to the wrong network.
  if (wrongNetwork) {
    return (
      <button
        type="button"
        className="btn btn--small"
        onClick={() => void switchNetwork()}
        title="This app runs on Hedera testnet"
      >
        Switch to Hedera testnet
      </button>
    );
  }

  return (
    <button
      type="button"
      className="wallet-chip"
      onClick={disconnect}
      title={isInjected ? "Disconnect (forgets the account here)" : "Disconnect demo wallet"}
    >
      <span className="wallet-chip__dot" aria-hidden="true" />
      <span className="mono">{shortAddress}</span>
      {!compact && (
        <span className="wallet-chip__network">
          {isInjected ? demo.network : "demo wallet"}
        </span>
      )}
    </button>
  );
}
