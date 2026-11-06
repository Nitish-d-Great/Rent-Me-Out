import { notFound } from "next/navigation";
import { WorldProbeClient } from "@/components/workspace/world-probe-client";

export const metadata = { title: "World ID probe · dev" };

export default function WorldProbePage() {
  // Diagnostics only. Never served from a production build.
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <section className="stack">
      <h1>World ID probe</h1>
      <p className="dim">
        IDKit reports a refused request as <span className="mono">generic_error</span> and
        nothing else. Each button changes one input, so whichever combination succeeds
        names the cause.
      </p>
      <WorldProbeClient />
    </section>
  );
}
