"use client";

import Link from "next/link";
import { useState } from "react";
import { useWallet } from "@/components/providers";
import { useWalletVerified } from "@/lib/chain/use-owner";
import { buyRoom, explainBuyError, type BuyStage } from "@/lib/chain/buy";
import { VerifyBadge } from "@/components/ui/verify-badge";
import { WorldIdButton } from "@/components/ui/world-id-button";
import { demo, formatDate, formatUsdc, type Room, periodLabel } from "@/lib/data";
import { shortAddress } from "@/lib/chain/to-room";

type Step = "idle" | "processing" | "done";

export function BuyPanel({ room, live = false }: { room: Room; live?: boolean }) {
  const { connected, connect, address } = useWallet();
  const { verified, identityShort, confirm: setVerified } = useWalletVerified(address);
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<BuyStage | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const held = room.state !== "available";

  /**
   * The real purchase: the broker signs from their own wallet, so the registrar key
   * can never buy on their behalf. Tops up from the testnet faucet if they are short,
   * approves the registry, then calls buyRoom -- each step waited on before the next.
   */
  const buy = async () => {
    if (!address) {
      setError("Connect a wallet first.");
      return;
    }
    const usdc = process.env.NEXT_PUBLIC_DEMO_USDC_ADDRESS;
    const registry = process.env.NEXT_PUBLIC_RENTAL_REGISTRY_ADDRESS;
    if (!usdc || !registry) {
      setError("Contract addresses are not configured.");
      return;
    }

    setError(null);
    setTxHash(null);
    setStep("processing");
    try {
      const hash = await buyRoom({
        listingId: BigInt(room.id),
        broker: address as `0x${string}`,
        usdc: usdc as `0x${string}`,
        registry: registry as `0x${string}`,
        onProgress: (p) => {
          setStage(p.stage);
          if (p.hash) setTxHash(p.hash);
        },
      });
      setTxHash(hash);
      setStep("done");
      // The sale is final on Hedera. Updating the Arkiv index only affects search, so a
      // failure here must not read as a failed purchase.
      void fetch(`/api/rooms/${room.id}/sync`, { method: "POST" }).catch(() => undefined);
    } catch (err) {
      setError(explainBuyError(err));
      setStep("idle");
    } finally {
      setStage(null);
    }
  };

  const stageLabel: Record<BuyStage, string> = {
    checking: "Checking the listing…",
    funding: "Minting test USDC…",
    approving: "Approving USDC — confirm in your wallet…",
    buying: "Confirm the purchase in your wallet…",
    confirming: "Waiting for Hedera to confirm…",
    done: "Done",
  };

  if (held) {
    return (
      <aside className="buy-panel">
        <div className="buy-panel__head">
          <span className="badge badge--brass">Sold for this period</span>
          <div className="buy-panel__price" style={{ marginTop: 16 }}>
            {formatUsdc(room.price)} <small>USDC</small>
          </div>
        </div>
        <div className="buy-panel__body">
          <div className="notice notice--brass">
            <span className="notice__icon" aria-hidden="true">
              ✓
            </span>
            <div>
              <strong>{room.name} has one current holder.</strong>
              <p>
                The token is held by a verified broker until{" "}
                {formatDate(room.validUntil)}.
              </p>
            </div>
          </div>

          <div className="buy-panel__list" style={{ marginTop: 18 }}>
            <div>
              <span>Holder</span>
              <span className="mono">{room.holder ? shortAddress(room.holder) : "—"}</span>
            </div>
            <div>
              <span>Rights period</span>
              <span>{periodLabel(room)}</span>
            </div>
            <div>
              <span>Token</span>
              <span className="mono">{room.tokenId}</span>
            </div>
          </div>

          {room.holderNullifier && (
            <VerifyBadge label="Broker" hash={room.holderNullifier} />
          )}

          <Link
            href={`/verify/${demo.propertyId}?room=${room.id}`}
            className="btn btn--wide"
            style={{ marginTop: 18 }}
          >
            Verify this room
          </Link>
          <p className="buy-panel__note">
            Sold rights cannot be resold or cancelled in this demo. At expiry,
            the token is burned and the room can be listed again.
          </p>
        </div>
      </aside>
    );
  }

  return (
    <aside className="buy-panel">
      <div className="buy-panel__head">
        <span className="badge badge--quiet">Available · one token</span>
        <div className="buy-panel__price" style={{ marginTop: 16 }}>
          {formatUsdc(room.price)} <small>USDC / period</small>
        </div>
      </div>

      <div className="buy-panel__body">
        <div className="buy-panel__list">
          <div>
            <span>Rights period</span>
            <span>{periodLabel(room)}</span>
          </div>
          <div>
            <span>Valid from</span>
            <span>{formatDate(room.validFrom)}</span>
          </div>
          <div>
            <span>Valid until</span>
            <span>{formatDate(room.validUntil)}</span>
          </div>
          <div>
            <span>Property</span>
            <span className="green">Registrar-approved</span>
          </div>
        </div>

        {step === "done" ? (
          <div className="notice notice--verified">
            <span className="notice__icon" aria-hidden="true">
              ✓
            </span>
            <div>
              <strong>{room.name.split("·")[0].trim()} bought.</strong>
              <p>
                Payment received and the room token is now held by your wallet.
                Rights are valid until {formatDate(room.validUntil)}.
              </p>
              {txHash && (
                <a
                  href={`https://hashscan.io/testnet/transaction/${txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mono"
                  style={{ marginTop: 8, wordBreak: "break-all", display: "block" }}
                >
                  {txHash}
                </a>
              )}
              <Link
                href="/broker"
                className="text-link"
                style={{ marginTop: 10 }}
              >
                Open my room rights
              </Link>
            </div>
          </div>
        ) : (
          <>
            {!connected && (
              <>
                <p className="buy-panel__note">
                  Connect a Hedera-compatible wallet to buy this room. The token
                  can only be transferred to a verified broker.
                </p>
                <button
                  type="button"
                  className="btn btn--wide"
                  onClick={() => void connect()}
                >
                  Connect wallet
                </button>
              </>
            )}

            {connected && !verified && (
              <>
                <p className="buy-panel__note">
                  Buying is locked until World ID is validated by the backend
                  and your wallet is verified on-chain.
                </p>
                <WorldIdButton
                  action="broker-verify"
                  label="Verify with World ID"
                  onVerified={setVerified}
                />
              </>
            )}

            {connected && verified && !live && (
              <p className="buy-panel__note" style={{ color: "crimson" }}>
                This is a sample room with no on-chain listing behind it, so it
                cannot be bought. Open a room from the live registry instead.
              </p>
            )}

            {connected && verified && live && (
              <>
                <VerifyBadge label="Verified broker" hash={identityShort} />
                <button
                  type="button"
                  className="btn btn--brass btn--wide"
                  style={{ marginTop: 12 }}
                  onClick={() => void buy()}
                  disabled={step === "processing"}
                >
                  {step === "processing"
                    ? (stage ? stageLabel[stage] : "Confirming payment and token…")
                    : `Buy ${room.name.split("·")[0].trim()} · ${formatUsdc(room.price)} USDC`}
                </button>
                {step === "processing" && (
                  <p className="buy-panel__note" aria-live="polite">
                    Waiting for USDC settlement and the token transfer. The
                    purchase is not complete until both confirm.
                  </p>
                )}
              </>
            )}

            {error && (
              <div className="notice notice--alert" style={{ marginTop: 14 }}>
                <span className="notice__icon" aria-hidden="true">
                  !
                </span>
                <div>
                  <strong>Insufficient USDC.</strong>
                  <p>
                    Add USDC to your wallet to buy this room, then try again.
                  </p>
                </div>
              </div>
            )}

            {connected && verified && (
              <div className="demo-states">
                <span className="demo-states__label">Demo failure path</span>
                <button
                  type="button"
                  className="demo-chip"
                  onClick={() =>
                    setError(
                      "Insufficient USDC. Add USDC to your wallet to buy this room.",
                    )
                  }
                >
                  Insufficient USDC
                </button>
              </div>
            )}
          </>
        )}

        <p className="buy-panel__note">
          The payment buys the time-limited right to rent the room. Tenant rent,
          deposit and lease terms stay between you and the tenant. There are no
          refunds for an early exit.
        </p>
      </div>
    </aside>
  );
}
