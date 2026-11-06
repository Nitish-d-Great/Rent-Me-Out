import type { RoomState } from "@/lib/data";

const labels: Record<RoomState, string> = {
  available: "Available",
  held: "Sold",
  frozen: "Frozen",
  expired: "Expired",
  cancelled: "Cancelled",
};

const className: Record<RoomState, string> = {
  available: "stamp stamp--available",
  held: "stamp stamp--sold",
  frozen: "stamp stamp--frozen",
  expired: "stamp stamp--expired",
  // Both mean a burned token with no holder, so they share a style.
  cancelled: "stamp stamp--expired",
};

export function StatusStamp({
  state,
  label,
}: {
  state: RoomState;
  label?: string;
}) {
  return <span className={className[state]}>{label ?? labels[state]}</span>;
}

const approvalClass = {
  approved: "badge badge--verified",
  pending: "badge badge--brass",
  rejected: "badge badge--alert",
  archived: "badge badge--quiet",
} as const;

const approvalLabel = {
  approved: "Approved",
  pending: "Needs review",
  rejected: "Rejected",
  archived: "Archived",
} as const;

export function ApprovalBadge({
  state,
}: {
  state: "approved" | "pending" | "rejected" | "archived";
}) {
  return (
    <span className={approvalClass[state]}>
      {state === "approved" && (
        <span className="badge__check" aria-hidden="true">
          ✓
        </span>
      )}
      {approvalLabel[state]}
    </span>
  );
}
