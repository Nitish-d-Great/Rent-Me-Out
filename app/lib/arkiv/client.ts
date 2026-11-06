import "server-only";
import { createPublicClient, createWalletClient } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

/**
 * Arkiv's current testnet, Rabdi.
 *
 * ARKIV_ACCESS_KEY only buys RPC quota; what authorises a write is the signing wallet,
 * which pays in tGLM. It defaults to the registrar's key so one address is responsible
 * for everything the backend publishes.
 */
function chain() {
  return rabdi({ accessKey: process.env.ARKIV_ACCESS_KEY ?? "" });
}

function writerAccount() {
  const key = process.env.ARKIV_PRIVATE_KEY ?? process.env.REGISTRAR_PRIVATE_KEY;
  if (!key) throw new Error("ARKIV_PRIVATE_KEY or REGISTRAR_PRIVATE_KEY must be set");
  return privateKeyToAccount((key.startsWith("0x") ? key : `0x${key}`) as Hex);
}

/** Anyone can write under our schema names, so every read must filter on this owner. */
export function arkivWriterAddress(): `0x${string}` {
  return writerAccount().address;
}

export function arkivPublic() {
  return createPublicClient({ chain: chain(), transport: http() });
}

export function arkivWallet() {
  return createWalletClient({ chain: chain(), transport: http(), account: writerAccount() });
}

/**
 * Runs writes one at a time. They all come from one wallet, so two running together
 * could pick the same nonce and one would fail.
 */
let queue: Promise<unknown> = Promise.resolve();

export function serialWrite<T>(write: () => Promise<T>): Promise<T> {
  const run = queue.then(write, write);
  queue = run.catch(() => undefined);
  return run;
}

/** Columns read back as { type, value }. */
export function columnValue<T = string>(column: unknown): T | undefined {
  return (column as { value?: T } | undefined)?.value;
}
