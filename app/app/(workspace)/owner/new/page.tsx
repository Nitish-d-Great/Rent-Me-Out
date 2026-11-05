import type { Metadata } from "next";
import Link from "next/link";
import { PropertyForm } from "@/components/workspace/property-form";

export const metadata: Metadata = {
  title: "Submit a property",
};

export default function NewPropertyPage() {
  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">Owner · submit property</p>
          <h1>A deed first. Then a listing.</h1>
          <p>
            The registrar checks the encrypted deed before any room token can be
            minted. The public record never contains the address, the document,
            or a cleartext storage pointer.
          </p>
        </div>
        <div className="page-head__actions">
          <Link href="/owner" className="btn btn--small btn--ghost">
            Back to dashboard
          </Link>
        </div>
      </div>

      <div className="content-grid">
        <PropertyForm />
        <aside className="stack-16">
          <section className="panel panel--pad">
            <p className="eyebrow">What happens next</p>
            <div className="timeline" style={{ marginTop: 14 }}>
              <div className="timeline__item" data-done="true">
                <span className="timeline__dot" />
                <div>
                  <strong>Identity</strong>
                  <span>World ID validated by the backend</span>
                </div>
              </div>
              <div className="timeline__item" data-done="true">
                <span className="timeline__dot" />
                <div>
                  <strong>Encrypt + store</strong>
                  <span>Deed encrypted to Swarm</span>
                </div>
              </div>
              <div className="timeline__item">
                <span className="timeline__dot" />
                <div>
                  <strong>Opaque application</strong>
                  <span>Arkiv gets a pending record, no deed link</span>
                </div>
              </div>
              <div className="timeline__item">
                <span className="timeline__dot" />
                <div>
                  <strong>Registrar review</strong>
                  <span>Approve on Hedera, or reject with a reason</span>
                </div>
              </div>
            </div>
          </section>

          <section className="panel panel--pad">
            <p className="eyebrow">Privacy boundary</p>
            <p className="small" style={{ marginTop: 10, color: "rgba(22,35,59,.68)" }}>
              A random salt produces a hiding commitment to the property. Only
              the commitment and the approved-set root reach Hedera. A plain
              hash of an address would be guessable; this is not one.
            </p>
            <p className="mono" style={{ marginTop: 14, fontSize: 10 }}>
              commit = Poseidon(property, salt)
            </p>
          </section>
        </aside>
      </div>
    </>
  );
}
