import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { VerifyClient } from "@/components/verify/verify-client";
import { property, type RoomState } from "@/lib/data";

type PageProps = {
  params: Promise<{ propertyId: string }>;
  searchParams: Promise<{ room?: string; state?: string }>;
};

const validStates: RoomState[] = ["available", "held", "frozen", "expired", "cancelled"];

export const dynamicParams = false;

export function generateStaticParams() {
  return [{ propertyId: property.id }];
}

export const metadata: Metadata = {
  title: "Verify a room",
  description:
    "Check the current holder and rights period for a room without an account, then verify the broker in person with World ID.",
};

export default async function VerifyPropertyPage({ params, searchParams }: PageProps) {
  const [{ propertyId }, query] = await Promise.all([params, searchParams]);
  if (propertyId !== property.id) notFound();

  const initialState =
    query.state && validStates.includes(query.state as RoomState)
      ? query.state as RoomState
      : undefined;

  return <VerifyClient initialRoom={query.room ?? "r2"} initialState={initialState} />;
}
