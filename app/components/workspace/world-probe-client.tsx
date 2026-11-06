"use client";

import { useCallback, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { probeEnroll, type ProbeOutcome } from "@/lib/world/client";

type Case = {
  id: string;
  label: string;
  why: string;
  /** "fresh" mints a new action at click time. Generating it at module scope made the
   *  server and client render different strings, which is a hydration mismatch. */
  action: "fresh" | string;
  createSession: boolean;
};

const CASES: Case[] = [
  {
    id: "a",
    label: "Fresh action + session",
    why: "If this passes, reusing broker-verify is the problem — one action per identity.",
    action: "fresh",
    createSession: true,
  },
  {
    id: "b",
    label: "Fresh action, NO session",
    why: "Passes only here? Then creating a second session is the problem.",
    action: "fresh",
    createSession: false,
  },
  {
    id: "c",
    label: "broker-verify, NO session",
    why: "Passes here? The action is fine and session creation is the blocker.",
    action: "broker-verify",
    createSession: false,
  },
  {
    id: "d",
    label: "broker-verify + session (what the app does)",
    why: "The failing combination, for comparison.",
    action: "broker-verify",
    createSession: true,
  },
];

function freshAction(): string {
  return `probe-${Math.random().toString(36).slice(2, 10)}`;
}

export function WorldProbeClient() {
  const [running, setRunning] = useState<string | null>(null);
  const [usedAction, setUsedAction] = useState<Record<string, string>>({});
  const [uri, setUri] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, ProbeOutcome>>({});

  const run = useCallback(async (c: Case) => {
    const action = c.action === "fresh" ? freshAction() : c.action;
    setUsedAction((m) => ({ ...m, [c.id]: action }));
    setRunning(c.id);
    setUri(null);
    const outcome = await probeEnroll({
      action,
      createSession: c.createSession,
      onConnectorUri: setUri,
    });
    setResults((r) => ({ ...r, [c.id]: outcome }));
    setRunning(null);
    setUri(null);
  }, []);

  return (
    <div className="stack">
      {CASES.map((c) => {
        const res = results[c.id];
        return (
          <div key={c.id} className="notice" style={{ alignItems: "flex-start" }}>
            <div style={{ flex: 1 }}>
              <strong>{c.label}</strong>
              <p className="micro dim">{c.why}</p>
              <p className="mono micro">
                action {usedAction[c.id] ?? (c.action === "fresh" ? "(new each run)" : c.action)}
                {" · session "}
                {c.createSession ? "create" : "none"}
              </p>
              {res && (
                <p className="mono" style={{ color: res.ok ? "green" : "crimson" }}>
                  {res.ok
                    ? `PASS — ${res.credential}, session ${res.sessionCreated ? "created" : "none"}`
                    : `FAIL — ${res.detail}`}
                </p>
              )}
              <button
                type="button"
                className="btn btn--small"
                style={{ marginTop: 10 }}
                disabled={running !== null}
                onClick={() => void run(c)}
              >
                {running === c.id ? "Scan the QR…" : "Run"}
              </button>
            </div>
            {running === c.id && uri && (
              <div style={{ padding: 10, background: "#fff", borderRadius: 6 }}>
                <QRCodeSVG value={uri} size={150} bgColor="#ffffff" fgColor="#16233b" level="M" marginSize={1} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
