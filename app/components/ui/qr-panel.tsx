"use client";

import { QRCodeSVG } from "qrcode.react";

export function QRPanel({
  value,
  title = "Room 2 · verification link",
  note = "A tenant can scan this at the door. No account needed.",
}: {
  value: string;
  title?: string;
  note?: string;
}) {
  return (
    <div className="qr-panel">
      <div className="qr-panel__code">
        <QRCodeSVG
          value={value}
          size={132}
          bgColor="#ffffff"
          fgColor="#16233b"
          level="M"
          marginSize={1}
        />
      </div>
      <div>
        <h3>{title}</h3>
        <p>{note}</p>
        <p className="mono" style={{ marginTop: 10, wordBreak: "break-all" }}>
          {value.replace(/^https?:\/\//, "").slice(0, 52)}
        </p>
      </div>
    </div>
  );
}
