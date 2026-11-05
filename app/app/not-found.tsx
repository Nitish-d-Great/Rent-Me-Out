import Link from "next/link";

export default function NotFound() {
  return (
    <main className="shell section">
      <p className="eyebrow">404 · sheet missing</p>
      <h1 className="display-small" style={{ marginTop: 16, maxWidth: "12ch" }}>
        This room is not on the drawing sheet.
      </h1>
      <p className="lede" style={{ marginTop: 18 }}>
        The link may have expired with its rental period, or the room identifier
        is wrong. Try the public marketplace or verify the room again.
      </p>
      <div className="flex wrap gap-8" style={{ marginTop: 28 }}>
        <Link href="/marketplace" className="btn">
          Browse rooms
        </Link>
        <Link href="/" className="btn btn--ghost">
          Back home
        </Link>
      </div>
    </main>
  );
}
