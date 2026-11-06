"use client";

import { createWalletClient } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { custom, type Address } from "viem";

type EthereumProvider = Parameters<typeof custom>[0];

export async function arkivBrowserWallet(address: string) {
  const ethereum = (window as Window & { ethereum?: EthereumProvider }).ethereum;
  if (!ethereum) throw new Error("wallet_required_for_arkiv");
  const chain = rabdi({ accessKey: process.env.NEXT_PUBLIC_ARKIV_ACCESS_KEY ?? "" });
  const client = createWalletClient({ chain, transport: custom(ethereum), account: address as Address });
  await client.addChain({ chain: rabdi({ accessKey: "" }) });
  await ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x76edaf" }] });
  return client;
}
