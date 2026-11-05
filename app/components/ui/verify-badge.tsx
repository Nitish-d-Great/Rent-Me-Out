import { demo } from "@/lib/data";

export function VerifyBadge({
  label = "Verified broker",
  hash = demo.nullifierShort,
}: {
  label?: string;
  hash?: string;
}) {
  return (
    <span className="badge badge--verified">
      <span className="badge__check" aria-hidden="true">
        ✓
      </span>
      {label}
      <span className="mono dim">{hash}</span>
    </span>
  );
}
