import { NextResponse } from "next/server";

/**
 * DEV ONLY — hands an IDKit connector URI to the World ID Simulator so a request
 * completes with a real Proof of Human and no phone.
 *
 * This is a backdoor: anything that can reach it can complete any pending World ID
 * request it has the connector URI for. It is therefore guarded twice, and both must
 * pass —
 *
 *   1. NODE_ENV must not be "production" (so a production build cannot serve it even
 *      if the env var leaks into the deployment), and
 *   2. WORLD_DEV_SIMULATOR must be explicitly "1" (so it stays off in a dev server
 *      unless someone opts in).
 *
 * It returns 404 rather than 403 when disabled: a disabled backdoor should be
 * indistinguishable from one that was never built.
 *
 * The connector URI is accepted from the client, forwarded, and never logged or echoed
 * back — it carries the bridge encryption key.
 */

function enabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.WORLD_DEV_SIMULATOR === "1";
}

export async function POST(request: Request) {
  if (!enabled()) {
    return new NextResponse(null, { status: 404 });
  }

  const { connect_url: connectUrl } = (await request.json()) as {
    connect_url?: string;
  };

  if (!connectUrl || typeof connectUrl !== "string") {
    return NextResponse.json({ error: "missing_connect_url" }, { status: 400 });
  }

  let res: Response;
  try {
    res = await fetch("https://simulator.worldcoin.org/api/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "complete_test_request", arguments: { connect_url: connectUrl } },
      }),
    });
  } catch {
    return NextResponse.json({ error: "simulator_unreachable" }, { status: 502 });
  }

  // The simulator answers with a server-sent-events envelope, not plain JSON.
  const raw = await res.text();
  const line = raw
    .split("\n")
    .filter((l) => l.startsWith("{") || l.startsWith("data: {"))
    .pop();

  if (!line) {
    return NextResponse.json({ error: "simulator_unparseable" }, { status: 502 });
  }

  const rpc = JSON.parse(line.replace(/^data: /, "")) as {
    result?: { content?: Array<{ text?: string }>; isError?: boolean };
    error?: unknown;
  };

  const text = rpc.result?.content?.[0]?.text ?? "";

  // Dev route: surface the simulator's verdict in the server log. Never the
  // connector URI -- that carries the bridge encryption key.
  console.log("[dev/simulate]", rpc.result?.isError ? "ERROR" : "ok", text || JSON.stringify(rpc.error ?? {}));

  return NextResponse.json(
    { ok: !rpc.error && !rpc.result?.isError, detail: text },
    { headers: { "Cache-Control": "no-store" } },
  );
}
