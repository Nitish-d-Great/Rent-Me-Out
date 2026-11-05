"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ApprovalBadge } from "@/components/ui/status-stamp";
import {
  formatDate,
  type ApprovalState,
  type Property,
} from "@/lib/data";

const groups: Array<{ key: ApprovalState; label: string }> = [
  { key: "approved", label: "Approved" },
  { key: "pending", label: "Needs review" },
  { key: "rejected", label: "Rejected" },
  { key: "archived", label: "Archived" },
];

export function OwnerProperties({ properties }: { properties: Property[] }) {
  const [active, setActive] = useState<ApprovalState>("approved");

  const counts = useMemo(
    () =>
      groups.reduce<Record<string, number>>((accumulator, group) => {
        accumulator[group.key] = properties.filter(
          (property) => property.approval === group.key,
        ).length;
        return accumulator;
      }, {}),
    [properties],
  );

  const shown = properties.filter((property) => property.approval === active);

  return (
    <div className="panel">
      <div className="panel__head">
        <h2>My properties</h2>
        <span className="badge badge--quiet">{properties.length} total</span>
      </div>
      <div className="filter-bar" style={{ padding: "12px 18px", borderTop: 0 }}>
        {groups.map((group) => (
          <button
            key={group.key}
            type="button"
            className="demo-chip"
            data-active={active === group.key}
            onClick={() => setActive(group.key)}
          >
            {group.label} · {counts[group.key] ?? 0}
          </button>
        ))}
      </div>
      <div className="panel__body">
        {shown.length === 0 ? (
          <div className="empty-state">
            <h3>Nothing here.</h3>
            <p>Properties move into this group as their review state changes.</p>
          </div>
        ) : (
          <div className="property-list">
            {shown.map((item) => (
              <article className="property-card" key={item.id}>
                <div className="property-card__thumb">
                  {item.rooms.length > 0 ? "3 BHK" : "—"}
                </div>
                <div>
                  <div className="between" style={{ alignItems: "flex-start" }}>
                    <h3>{item.nickname}</h3>
                    <ApprovalBadge state={item.approval} />
                  </div>
                  <p className="property-card__meta">
                    {item.locality}, {item.city} · submitted{" "}
                    {formatDate(item.submittedAt)}
                  </p>
                  <p className="property-card__next">
                    {item.approval === "approved" &&
                      `${item.rooms.length} room rights active · ${item.deedPages} page deed on file`}
                    {item.approval === "pending" &&
                      "Waiting for the registrar to open the encrypted deed."}
                    {item.approval === "rejected" &&
                      item.rejectionReason}
                    {item.approval === "archived" &&
                      "Withdrawn by you. No active listings."}
                  </p>
                </div>
                <div className="property-card__aside">
                  {item.approval === "approved" && (
                    <Link href="/owner/listings/new">Create listing</Link>
                  )}
                  {item.approval === "rejected" && (
                    <Link href="/owner/new">Resubmit deed</Link>
                  )}
                  {item.approval === "pending" && (
                    <span className="badge badge--brass">In queue</span>
                  )}
                  {item.approval === "archived" && (
                    <span className="badge badge--quiet">No action</span>
                  )}
                  <span className="micro dim">
                    {item.reviewedAt
                      ? `reviewed ${formatDate(item.reviewedAt)}`
                      : "not reviewed"}
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
