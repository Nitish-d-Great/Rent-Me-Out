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
  /** Dev only: switch to a fresh throwaway address. */
  rotate: () => void;
}

const WalletContext = createContext<WalletContextValue | null>(null);

// 40 hex characters: a real address, so viem's isAddress() accepts it. The short
// form the UI renders ("0x9f21…7c04") is unchanged.
const DEMO_WALLET = "0x9f21c4a8b7e602d15a3c8f90be4271ad3b8e7c04";

const WALLET_KEY = "rmo.wallet.address";

/**
 * A throwaway address, for development only.
 *
 * The registry binds one identity per wallet permanently, so a wallet that has been
 * through enrollment once can never enroll again -- correct behaviour, but it makes the
 * happy path untestable a second time. Rotating to a fresh address gives a clean run,
 * and keeping the old one lets the same human try a second wallet, which is the
 * duplicate-identity rejection.
 */
function randomWallet(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return "0x" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);

  useEffect(() => {
    if (window.localStorage.getItem("rmo.wallet") === "connected") {
      setAddress(window.localStorage.getItem(WALLET_KEY) ?? DEMO_WALLET);
    }
  }, []);

  const connect = useCallback(() => {
    const stored = window.localStorage.getItem(WALLET_KEY) ?? DEMO_WALLET;
    setAddress(stored);
    window.localStorage.setItem(WALLET_KEY, stored);
    window.localStorage.setItem("rmo.wallet", "connected");
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
    window.localStorage.removeItem("rmo.wallet");
  }, []);

  const rotate = useCallback(() => {
    const next = randomWallet();
    window.localStorage.setItem(WALLET_KEY, next);
    window.localStorage.setItem("rmo.wallet", "connected");
    setAddress(next);
  }, []);

  const value = useMemo(
    () => ({
      connected: Boolean(address),
      address,
      shortAddress: address ? `${address.slice(0, 6)}…${address.slice(-4)}` : null,
      connect,
      disconnect,
      rotate,
    }),
    [address, connect, disconnect, rotate],
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
