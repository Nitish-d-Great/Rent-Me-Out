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

/** Hedera testnet, as MetaMask wants it for wallet_addEthereumChain. */
const HEDERA_TESTNET = {
  chainId: "0x128", // 296
  chainName: "Hedera Testnet",
  nativeCurrency: { name: "HBAR", symbol: "HBAR", decimals: 18 },
  rpcUrls: ["https://testnet.hashio.io/api"],
  blockExplorerUrls: ["https://hashscan.io/testnet"],
} as const;

interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, handler: (...args: never[]) => void): void;
  removeListener?(event: string, handler: (...args: never[]) => void): void;
}

function injected(): Eip1193Provider | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { ethereum?: Eip1193Provider }).ethereum ?? null;
}

interface WalletContextValue {
  connected: boolean;
  address: string | null;
  shortAddress: string | null;
  /** True when a real injected wallet is in use, false for the dev placeholder. */
  isInjected: boolean;
  /** Current chain id, or null when unknown / using the placeholder. */
  chainId: number | null;
  /** True when connected to a real wallet on the wrong network. */
  wrongNetwork: boolean;
  connecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  switchNetwork: () => Promise<void>;
  /** Dev placeholder only: switch to a fresh throwaway address. */
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
 * through enrollment once can never enroll again. Rotating gives a clean run. Only used
 * when no injected wallet is present -- with MetaMask you switch accounts there.
 */
function randomWallet(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return "0x" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [isInjected, setIsInjected] = useState(false);
  const [chainId, setChainId] = useState<number | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reconnect silently if the wallet is already authorised, so a refresh does not
  // force the user through the prompt again.
  useEffect(() => {
    const eth = injected();
    if (!eth) {
      if (window.localStorage.getItem("rmo.wallet") === "connected") {
        setAddress(window.localStorage.getItem(WALLET_KEY) ?? DEMO_WALLET);
      }
      return;
    }

    void (async () => {
      try {
        const accounts = (await eth.request({ method: "eth_accounts" })) as string[];
        if (accounts?.length) {
          setAddress(accounts[0]);
          setIsInjected(true);
          const hex = (await eth.request({ method: "eth_chainId" })) as string;
          setChainId(Number.parseInt(hex, 16));
        }
      } catch {
        // An unavailable wallet is not an error worth surfacing on load.
      }
    })();

    const onAccounts = (...args: never[]) => {
      const accounts = args[0] as unknown as string[];
      // Switching accounts in MetaMask is how you change role here, so follow it.
      setAddress(accounts?.length ? accounts[0] : null);
      if (!accounts?.length) setIsInjected(false);
    };
    const onChain = (...args: never[]) => {
      setChainId(Number.parseInt(args[0] as unknown as string, 16));
    };
    eth.on?.("accountsChanged", onAccounts);
    eth.on?.("chainChanged", onChain);
    return () => {
      eth.removeListener?.("accountsChanged", onAccounts);
      eth.removeListener?.("chainChanged", onChain);
    };
  }, []);

  const switchNetwork = useCallback(async () => {
    const eth = injected();
    if (!eth) return;
    try {
      await eth.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: HEDERA_TESTNET.chainId }],
      });
    } catch (err) {
      // 4902: the chain is unknown to the wallet, so offer to add it.
      if ((err as { code?: number })?.code === 4902) {
        await eth.request({
          method: "wallet_addEthereumChain",
          params: [HEDERA_TESTNET],
        });
      } else {
        throw err;
      }
    }
  }, []);

  const connect = useCallback(async () => {
    const eth = injected();

    if (!eth) {
      // No wallet extension: fall back to the dev placeholder so the app is still
      // usable, and so the simulator flow works without MetaMask installed.
      const stored = window.localStorage.getItem(WALLET_KEY) ?? DEMO_WALLET;
      setAddress(stored);
      window.localStorage.setItem(WALLET_KEY, stored);
      window.localStorage.setItem("rmo.wallet", "connected");
      return;
    }

    setConnecting(true);
    setError(null);
    try {
      const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
      if (!accounts?.length) throw new Error("No account returned");
      setAddress(accounts[0]);
      setIsInjected(true);

      const hex = (await eth.request({ method: "eth_chainId" })) as string;
      const current = Number.parseInt(hex, 16);
      setChainId(current);
      if (current !== 296) {
        await switchNetwork();
        setChainId(296);
      }
    } catch (err) {
      const code = (err as { code?: number })?.code;
      setError(
        code === 4001
          ? "Connection rejected in your wallet."
          : "Could not connect. Is MetaMask unlocked?",
      );
    } finally {
      setConnecting(false);
    }
  }, [switchNetwork]);

  const disconnect = useCallback(() => {
    // EIP-1193 has no disconnect: this forgets the account locally. Revoking access
    // is done in the wallet itself.
    setAddress(null);
    setIsInjected(false);
    setChainId(null);
    window.localStorage.removeItem("rmo.wallet");
  }, []);

  const rotate = useCallback(() => {
    if (injected()) return; // with a real wallet, switch accounts there instead
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
      isInjected,
      chainId,
      wrongNetwork: isInjected && chainId !== null && chainId !== 296,
      connecting,
      error,
      connect,
      disconnect,
      switchNetwork,
      rotate,
    }),
    [address, isInjected, chainId, connecting, error, connect, disconnect, switchNetwork, rotate],
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
