"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ReactLenis } from "lenis/react";

interface WalletContextValue {
  connected: boolean;
  address: string | null;
  shortAddress: string | null;
  connect: () => void;
  disconnect: () => void;
}

const WalletContext = createContext<WalletContextValue | null>(null);

const DEMO_WALLET = "0x9f21c4a8b7e602d15a3c8f90be4271ad7c04";

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);

  useEffect(() => {
    if (window.localStorage.getItem("rmo.wallet") === "connected") {
      setAddress(DEMO_WALLET);
    }
  }, []);

  const connect = useCallback(() => {
    setAddress(DEMO_WALLET);
    window.localStorage.setItem("rmo.wallet", "connected");
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
    window.localStorage.removeItem("rmo.wallet");
  }, []);

  const value = useMemo(
    () => ({
      connected: Boolean(address),
      address,
      shortAddress: address ? `${address.slice(0, 6)}…${address.slice(-4)}` : null,
      connect,
      disconnect,
    }),
    [address, connect, disconnect],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error("useWallet must be used inside WalletProvider");
  }
  return context;
}

function SmoothScroll({ children }: { children: ReactNode }) {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  if (reduced) return <>{children}</>;

  return (
    <ReactLenis
      root
      options={{
        lerp: 0.09,
        smoothWheel: true,
        wheelMultiplier: 0.95,
        touchMultiplier: 1.2,
      }}
    >
      {children}
    </ReactLenis>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <WalletProvider>
      <SmoothScroll>{children}</SmoothScroll>
    </WalletProvider>
  );
}
