import { NextResponse } from "next/server";
import { getApplication } from "@/lib/chain/applications";
import { isRegistrar } from "@/lib/registrar-auth";
import { downloadSealed } from "@/lib/swarm/store";

/** Decrypts a deed from Swarm. For the registrar only. */
export async function GET(
  request: Request,
  context: { params: Promise<{ applicationId: string }> },
) {
  if (!isRegistrar(request)) {
    return NextResponse.json({ error: "registrar_only" }, { status: 401 });
  }
  const { applicationId } = await context.params;
  try {
    const application = await getApplication(applicationId);
    if (!application) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const deed = await downloadSealed(application.deedRef);
    return new NextResponse(Buffer.from(deed), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${application.deedName.replace(/[^\w.-]/g, "_")}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[deed] read failed:", error);
    return NextResponse.json({ error: "deed_unavailable" }, { status: 502 });
  }
}
