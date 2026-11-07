export function VerifyBadge({
  label = "Verified broker",
  hash,
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
      {hash && <span className="mono dim">{hash}</span>}
    </span>
  );
}
