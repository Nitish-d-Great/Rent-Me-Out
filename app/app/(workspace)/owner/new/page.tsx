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
            The deed upload is encrypted in your browser before it reaches
            Swarm. The public-safe application fields are written to Arkiv;
            the registrar reviews the deed after receiving its key file through
            a secure channel.
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
                  <span>World ID check in this browser session</span>
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
                  <strong>Application record</strong>
                  <span>Public-safe application record on Arkiv Rabdi</span>
                </div>
              </div>
              <div className="timeline__item">
                <span className="timeline__dot" />
                <div>
                  <strong>Registrar review</strong>
                  <span>Allowlisted registrar reviews the deed and records a decision</span>
                </div>
              </div>
            </div>
          </section>

          <section className="panel panel--pad">
            <p className="eyebrow">Privacy boundary</p>
            <p className="small" style={{ marginTop: 10, color: "rgba(22,35,59,.68)" }}>
              This upload encrypts the PDF locally and sends ciphertext to the
              Swarm gateway. The Arkiv record contains no deed key or content
              reference; the owner shares the key file directly with the
              assigned registrar.
            </p>
          </section>
        </aside>
      </div>
    </>
  );
}
