import type { ReactNode } from "react";
import Link from "next/link";
import { demo } from "@/lib/data";

export default function VerifyLayout({ children }: { children: ReactNode }) {
  return (
    <div className="verify-page">
      <div className="verify-shell">
        <div className="verify-top">
          <Link href="/" className="brand">
            <span className="brand__mark" aria-hidden="true" />
            Rent Me Out
          </Link>
          <span className="badge badge--quiet">{demo.network}</span>
        </div>
        {children}
        <div className="footer-bottom verify-mini-foot">
          <span>Public verification · sample data · ETHGlobal Mumbai 2026</span>
          <span>No account required</span>
        </div>
      </div>
    </div>
  );
}
