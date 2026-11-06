"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ApprovalBadge } from "@/components/ui/status-stamp";
import { formatDate } from "@/lib/data";
import type { OwnerApplication } from "@/lib/chain/use-owner";

const groups: Array<{ key: OwnerApplication["status"]; label: string }> = [
  { key: "approved", label: "Approved" },
  { key: "pending", label: "Needs review" },
  { key: "rejected", label: "Rejected" },
];

export function OwnerProperties({
  properties,
  loading,
}: {
  properties: OwnerApplication[];
  loading: boolean;
}) {
  const [active, setActive] = useState<OwnerApplication["status"]>("approved");

  const counts = useMemo(
    () =>
      groups.reduce<Record<string, number>>((accumulator, group) => {
        accumulator[group.key] = properties.filter(
          (property) => property.status === group.key,
        ).length;
        return accumulator;
      }, {}),
    [properties],
  );

  const shown = properties.filter((property) => property.status === active);

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
            <h3>{loading ? "Reading from Arkiv…" : "Nothing here."}</h3>
            {!loading && (
              <p>Properties move into this group as their review state changes.</p>
            )}
          </div>
        ) : (
          <div className="property-list">
            {shown.map((item) => (
              <article className="property-card" key={item.applicationId}>
                <div className="property-card__thumb">
                  {item.rooms} {item.rooms === 1 ? "room" : "rooms"}
                </div>
                <div>
                  <div className="between" style={{ alignItems: "flex-start" }}>
                    <h3>{item.nickname}</h3>
                    <ApprovalBadge state={item.status} />
                  </div>
                  <p className="property-card__meta">
                    {item.locality}, {item.city} · submitted{" "}
                    {formatDate(item.submittedAt.slice(0, 10))}
                  </p>
                  <p className="property-card__next">
                    {item.status === "approved" &&
                      "Approved on Hedera. You can list its rooms."}
                    {item.status === "pending" &&
                      "Waiting for the registrar to open the encrypted deed."}
                    {item.status === "rejected" && item.reason}
                  </p>
                </div>
                <div className="property-card__aside">
                  {item.status === "approved" && (
                    <Link href="/owner/listings/new">Create listing</Link>
                  )}
                  {item.status === "rejected" && (
                    <Link href="/owner/new">Resubmit deed</Link>
                  )}
                  {item.status === "pending" && (
                    <span className="badge badge--brass">In queue</span>
                  )}
                  <span className="micro dim">
                    {item.decidedAt
                      ? `reviewed ${formatDate(item.decidedAt.slice(0, 10))}`
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
