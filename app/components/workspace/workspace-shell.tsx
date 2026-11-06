"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { WalletChip } from "@/components/ui/wallet-chip";

type Role = "owner" | "broker" | "registrar";

const roleConfig: Record<
  Role,
  { label: string; note: string; links: Array<{ href: string; label: string; key: string }> }
> = {
  owner: {
    label: "Owner workspace",
    note: "A property becomes listable only after World ID and registrar approval.",
    links: [
      { href: "/owner", label: "Dashboard", key: "01" },
      { href: "/owner/new", label: "Submit property", key: "02" },
      { href: "/owner/listings/new", label: "Create listing", key: "03" },
      { href: "/profile", label: "Public profile", key: "04" },
      { href: "/owner#sales", label: "Sales", key: "05" },
    ],
  },
  broker: {
    label: "Broker workspace",
    note: "Buying is restricted to verified broker wallets. One person, one wallet.",
    links: [
      { href: "/broker", label: "Overview", key: "01" },
      { href: "/marketplace", label: "Browse rooms", key: "02" },
      { href: "/broker#rights", label: "My room rights", key: "03" },
      { href: "/verify/rmo-3b-andheri?room=r2", label: "Public verify", key: "04" },
      { href: "/profile", label: "Public profile", key: "05" },
    ],
  },
  registrar: {
    label: "Registrar console",
    note: "Actions are permissioned and recorded with actor, time, target, reason and transaction.",
    links: [
      { href: "/registrar", label: "Review queue", key: "01" },
      { href: "/registrar#properties", label: "Rooms + disputes", key: "02" },
      { href: "/registrar#audit", label: "Audit log", key: "03" },
    ],
  },
};

const tabs: Array<{ role: Role; href: string; label: string }> = [
  { role: "owner", href: "/owner", label: "Owner" },
  { role: "broker", href: "/broker", label: "Broker" },
  { role: "registrar", href: "/registrar", label: "Registrar" },
];

export function WorkspaceShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const role: Role = pathname.startsWith("/broker")
    ? "broker"
    : pathname.startsWith("/registrar")
      ? "registrar"
      : "owner";
  const config = roleConfig[role];

  const isCurrent = (href: string) => {
    const base = href.split("#")[0];
    if (base === "/marketplace" || base.startsWith("/verify")) return false;
    return pathname === base || (base !== "/owner" && base !== "/broker" && base !== "/registrar" && pathname.startsWith(`${base}/`));
  };

  return (
    <div className="workspace">
      <div className="workspace__top">
        <Link href="/" className="brand">
          <span className="brand__mark" aria-hidden="true" />
          Rent Me Out
        </Link>
        <nav className="workspace__tabs" aria-label="Workspaces">
          {tabs.map((tab) => (
            <Link
              key={tab.role}
              href={tab.href}
              className="workspace__tab"
              aria-current={role === tab.role ? "page" : undefined}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
        <WalletChip compact />
      </div>

      <aside className="workspace__side">
        <div className="workspace__role">
          <span className="micro">Signed in as</span>
          <strong>{config.label}</strong>
        </div>
        <nav className="workspace__nav" aria-label={config.label}>
          {config.links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={isCurrent(link.href) ? "page" : undefined}
            >
              {link.label}
              <span>{link.key}</span>
            </Link>
          ))}
        </nav>
        <p className="workspace__side-note">{config.note}</p>
      </aside>

      <main className="workspace__main">{children}</main>
    </div>
  );
}
