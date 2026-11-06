import { NextResponse } from "next/server";
import { queryListings } from "@/lib/arkiv/listings";

/** Searches rooms on Arkiv. An index only: Hedera still decides who holds a room. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  try {
    const listings = await queryListings({
      city: params.get("city")?.trim() || undefined,
      status: params.get("status")?.trim() || undefined,
    });
    return NextResponse.json({ listings }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[arkiv] listing query failed:", error);
    return NextResponse.json({ error: "index_unavailable" }, { status: 502 });
  }
}
