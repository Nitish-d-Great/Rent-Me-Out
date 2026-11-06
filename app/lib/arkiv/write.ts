"use client";

import { ExpirationTime } from "@arkiv-network/sdk";
import { addr } from "@arkiv-network/sdk/schema";
import { UserProfile } from "@/lib/arkiv/schemas";
import { arkivBrowserWallet } from "@/lib/arkiv/browser-client";

export async function writeUserProfileEntity(address: string, role: "owner" | "renter" | "broker") {
  const client = await arkivBrowserWallet(address);
  return client.createEntity(UserProfile, {
    profileId: crypto.randomUUID(),
    wallet: addr(address as `0x${string}`),
    role,
  }, { expiration: ExpirationTime.fromDays(180), flags: { readonly: true } });
}

export async function renewUserProfileEntity(address: string, entityKey: `0x${string}`) {
  const client = await arkivBrowserWallet(address);
  return client.extendEntity({ entityKey, expiration: ExpirationTime.fromDays(180) });
}
