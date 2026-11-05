import { Suspense } from "react";
import { BrokerPresenceClient } from "@/components/workspace/broker-presence-client";

export const metadata = {
  title: "Prove rights at a viewing · Rent Me Out",
};

export default function BrokerPresencePage() {
  return (
    <section className="stack">
      <h1>Viewing check</h1>
      <p className="dim">
        A tenant has asked you to prove you hold the rights to this room.
      </p>
      <Suspense fallback={<p className="micro dim">Loading…</p>}>
        <BrokerPresenceClient />
      </Suspense>
    </section>
  );
}
