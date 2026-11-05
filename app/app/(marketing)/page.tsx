import type { Metadata } from "next";
import Link from "next/link";
import { SceneStage } from "@/components/scene/SceneStage";
import { demo } from "@/lib/data";

export const metadata: Metadata = {
  title: "One verified broker for every room",
  description:
    "Owners tokenise the right to rent a room. Brokers buy it. Tenants check it in seconds. Built for ETHGlobal Mumbai 2026.",
};

const chapters = [
  {
    title: "The deed is checked before anything is listed.",
    body: "An owner submits the property and deed. A platform registrar reviews the evidence and approves an opaque property commitment on Hedera.",
    tag: "registrar · deed review",
  },
  {
    title: "One room becomes one token.",
    body: "Each bedroom is issued a single ERC-3643 token for one rental period. Room 1, Room 2 and Room 3 are separate rights, not fractions.",
    tag: "Hedera · ATS",
  },
  {
    title: "The owner sets the period and price.",
    body: "Jan – Mar 2027, one upfront price per room. The registry rejects overlapping active periods for the same room before minting.",
    tag: "RentalRegistry.createListing()",
  },
  {
    title: "A real, unique person is verified.",
    body: "World ID produces a proof on the broker's device. Our backend validates it and stores a nullifier against the wallet — never a face or ID document.",
    tag: "World ID · broker-verify",
  },
  {
    title: "One payment, one token, one transaction.",
    body: "USDC moves from the broker to the owner while the room token moves from the owner to the broker. Room 2 now has exactly one holder.",
    tag: "buyRoom() · atomic where supported",
  },
  {
    title: "Anyone can check who holds the room.",
    body: "A tenant scans the QR at the door. Arkiv finds the public record, Hedera confirms the holder, and a fresh presence check can match the person present.",
    tag: "Arkiv → Hedera · no account",
  },
  {
    title: "At the end date, the right expires.",
    body: "The token is burned and the listing and verification records expire. The owner can list the same room for a later, non-overlapping period.",
    tag: "scheduled burn · keeper fallback",
  },
];

const stack = [
  {
    name: "Hedera + ATS",
    role: "Rights and settlement",
    what: "Room tokens, holder checks, freeze and burn, USDC settlement.",
    tag: "source of truth",
  },
  {
    name: "World ID",
    role: "Personhood",
    what: "Owner check, broker check, and a fresh presence check at the viewing.",
    tag: "owner · broker · presence",
  },
  {
    name: "Arkiv",
    role: "Public index",
    what: "Searchable applications, room listings and rights records that expire with the period.",
    tag: "discovery, not authority",
  },
  {
    name: "Swarm",
    role: "Private documents",
    what: "The deed is encrypted before upload. Only an audited registrar route can decrypt it.",
    tag: "registrar-only access",
  },
  {
    name: "ZK verifier",
    role: "Property privacy",
    what: "Proves the room is backed by an approved property without publishing address or deed.",
    tag: "browser-side verify",
  },
];

export default function HomePage() {
  return (
    <>
      <section className="hero grid-paper">
        <div className="shell hero__grid">
          <div className="hero__copy">
            <p className="eyebrow">Rental rights, made checkable</p>
            <h1 className="display" style={{ marginTop: 18 }}>
              One verified broker for every room.
            </h1>
            <p className="hero__support">
              Owners tokenise the right to rent a room. Brokers buy it. Tenants
              check it in seconds.
            </p>
            <div className="hero__actions">
              <Link href="/owner/new" className="btn">
                List a property
              </Link>
              <Link
                href="/verify/rmo-3b-andheri?room=r2"
                className="btn btn--ghost"
              >
                Verify a room
              </Link>
            </div>
            <div className="hero__foot">
              <span>
                <b>3 rooms</b> · one period
              </span>
              <span>Hedera testnet</span>
              <span>World ID simulator</span>
            </div>
          </div>

          <div className="hero__scene">
            <SceneStage />
          </div>
        </div>
      </section>

      <section className="trust-strip">
        <div className="shell">
          <div>
            <span className="eyebrow">The trust model</span>
            <h2>Three people. Three checks. One room.</h2>
          </div>
          <div className="trust-strip__grid">
            <article className="trust-item">
              <span className="trust-item__no">01 / owner</span>
              <span className="trust-item__mark" aria-hidden="true">
                ✓
              </span>
              <h3>A person, with a deed.</h3>
              <p>
                World ID confirms a unique owner. The registrar reviews the
                deed before the property can appear anywhere.
              </p>
            </article>
            <article className="trust-item">
              <span className="trust-item__no">02 / broker</span>
              <span className="trust-item__mark" aria-hidden="true">
                ✓
              </span>
              <h3>A person, not a duplicate.</h3>
              <p>
                One World ID identity binds to one wallet. A second wallet for
                the same person is blocked before it can buy.
              </p>
            </article>
            <article className="trust-item">
              <span className="trust-item__no">03 / at the door</span>
              <span className="trust-item__mark" aria-hidden="true">
                ✓
              </span>
              <h3>The person is the holder.</h3>
              <p>
                A tenant runs a fresh presence check. Green means the person
                present matches the wallet that holds the room right.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="section section-rule" id="how-it-works">
        <div className="shell">
          <div className="section-head">
            <div>
              <p className="eyebrow">How the right moves</p>
              <h2 className="display-small" style={{ marginTop: 14 }}>
                The whole right, in seven frames.
              </h2>
            </div>
            <p className="lede">
              A rental right is not a title deed and not a fraction of a flat.
              It is the exclusive, time-bound right to rent one named room for
              one period. Hedera records who holds it; the rest of the stack
              makes it useful and private.
            </p>
          </div>

          <div className="chapters" style={{ marginTop: 56 }}>
            <aside className="chapters__intro">
              <p className="eyebrow">The loop</p>
              <h2 className="display-small">Every frame is a real step.</h2>
              <p>
                The animation on this page follows the same seven phases as the
                product. Nothing on screen is a fake integration: hashes are
                fixed for the illustration, and the live flow uses the
                backend&apos;s real result.
              </p>
              <div className="notice notice--brass" style={{ marginTop: 24 }}>
                <span className="notice__icon" aria-hidden="true">
                  i
                </span>
                <div>
                  <strong>Illustration, not proof.</strong>
                  <p>
                    World ID generates the zero-knowledge proof. Rent Me Out
                    validates it server-side and uses the nullifier for
                    uniqueness and matching.
                  </p>
                </div>
              </div>
            </aside>

            <div className="chapter-list">
              {chapters.map((chapter, index) => (
                <article className="chapter" key={chapter.title}>
                  <span className="chapter__no">0{index + 1}</span>
                  <div>
                    <h3>{chapter.title}</h3>
                    <p>{chapter.body}</p>
                  </div>
                  <span className="chapter__tag">{chapter.tag}</span>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="proof-band">
        <div className="shell">
          <div className="proof-copy">
            <p className="eyebrow">Private by construction</p>
            <h2>Approved without publishing the address.</h2>
            <p>
              The registrar approves a hiding commitment, not a street address.
              The tenant&apos;s browser verifies a membership proof against the
              current approved-property root, then reads the holder separately
              from Hedera.
            </p>
            <p className="small">
              Property approval and broker match stay visibly separate. A proof
              shows that a registrar-approved attestation exists. It does not
              prove that a deed is genuine or that a QR is physically attached
              to the building.
            </p>
          </div>

          <div className="proof-sheet" aria-label="Example proof inputs">
            <div className="proof-sheet__cell">
              <span className="micro">Approved-property root</span>
              <div className="proof-sheet__value">{demo.propertyRoot}</div>
            </div>
            <div className="proof-sheet__cell">
              <span className="micro">Root version</span>
              <div className="proof-sheet__value">v{demo.rootVersion} · 2026-11-05</div>
            </div>
            <div className="proof-sheet__cell">
              <span className="micro">Opaque room commitment</span>
              <div className="proof-sheet__value">0x89bb…3ad2</div>
            </div>
            <div className="proof-sheet__cell">
              <span className="micro">Room period</span>
              <div className="proof-sheet__value">
                {demo.periodStart} → {demo.periodEnd}
              </div>
            </div>
            <div className="proof-sheet__cell">
              <span className="micro">Proof result</span>
              <div className="proof-sheet__value green">
                valid · current root
              </div>
            </div>
            <div className="proof-sheet__cell">
              <span className="micro">Holder read</span>
              <div className="proof-sheet__value">Hedera · {demo.brokerShort}</div>
            </div>
            <span className="stamp stamp--sold proof-sheet__stamp">
              Proof verified
            </span>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="shell">
          <div className="section-head">
            <div>
              <p className="eyebrow">Under the hood</p>
              <h2 className="display-small" style={{ marginTop: 14 }}>
                Five systems. One clear source of truth.
              </h2>
            </div>
            <p className="lede">
              Hedera is authoritative for the holder and lifecycle. Everything
              else either proves a person, finds a record, or keeps a private
              document private. The UI never treats an index as ownership.
            </p>
          </div>

          <div className="stack">
            {stack.map((item) => (
              <div className="stack-row" key={item.name}>
                <span className="stack-row__name">{item.name}</span>
                <span className="stack-row__role">{item.role}</span>
                <span className="stack-row__what">{item.what}</span>
                <span className="stack-row__tag">{item.tag}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="cta grid-paper">
        <div className="shell">
          <div>
            <p className="eyebrow">The promise</p>
            <h2>One room. One broker. One period.</h2>
            <p>
              Verifiable by anyone, without an account. That is the whole
              product.
            </p>
          </div>
          <div className="cta__actions">
            <Link href="/marketplace" className="btn">
              Browse rooms
            </Link>
            <Link href="/owner/new" className="btn btn--ghost">
              List a property
            </Link>
            <Link
              href="/verify/rmo-3b-andheri?room=r2"
              className="btn btn--ghost"
            >
              Verify a room
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
