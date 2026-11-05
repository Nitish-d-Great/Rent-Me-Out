import type { ReactNode } from "react";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteNav />
      <main>{children}</main>
      <SiteFooter />
    </>
  );
}
