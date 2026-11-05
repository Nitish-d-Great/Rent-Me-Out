"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { WalletChip } from "@/components/ui/wallet-chip";

const links = [
  { href: "/marketplace", label: "Browse rooms" },
  { href: "/owner", label: "Owner" },
  { href: "/broker", label: "Broker" },
  { href: "/verify/rmo-3b-andheri?room=r2", label: "Verify a room" },
];

export function SiteNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const isCurrent = (href: string) =>
    href.startsWith("/verify")
      ? pathname.startsWith("/verify")
      : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="site-nav">
      <div className="shell site-nav__inner">
        <Link href="/" className="brand" aria-label="Rent Me Out home">
          <span className="brand__mark" aria-hidden="true" />
          Rent Me Out
        </Link>

        <nav className="nav-links" aria-label="Primary">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={isCurrent(link.href) ? "page" : undefined}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="nav-actions">
          <Link href="/owner/new" className="btn btn--small btn--ghost">
            List a property
          </Link>
          <WalletChip />
          <button
            type="button"
            className="nav-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            <span aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="shell">
        <nav
          className="mobile-menu"
          data-open={open}
          aria-label="Mobile"
          aria-hidden={!open}
        >
          {links.map((link) => (
            <Link key={link.href} href={link.href}>
              {link.label}
            </Link>
          ))}
          <Link href="/owner/new">List a property</Link>
          <Link href="/registrar">Registrar console</Link>
        </nav>
      </div>
    </header>
  );
}
