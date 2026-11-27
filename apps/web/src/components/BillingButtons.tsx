"use client";
import { useState } from "react";

async function go(path: string, setErr: (s: string | null) => void, setBusy: (b: boolean) => void) {
  setBusy(true); setErr(null);
  try {
    const res = await fetch(path, { method: "POST" }); // same-origin: the browser sends Origin, the server checks it
    const j = (await res.json()) as { url?: string; error?: string };
    if (j.url) { window.location.assign(j.url); return; }
    setErr(j.error === "already_pro" ? "You're already on Pro." : "Couldn't open billing. Try again in a moment.");
  } catch { setErr("Couldn't reach billing. Check your connection and try again."); }
  setBusy(false);
}

export function UpgradeButton() {
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  return <div><button className="btn btn-primary" disabled={busy} onClick={() => go("/api/billing/checkout", setErr, setBusy)}>{busy ? "Opening checkout…" : "Upgrade to Pro"}</button>{err && <p role="alert" className="mt-2 text-[13px] text-[var(--danger)]">{err}</p>}</div>;
}
export function PortalButton() {
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  return <div><button className="btn" disabled={busy} onClick={() => go("/api/billing/portal", setErr, setBusy)}>{busy ? "Opening…" : "Manage subscription"}</button>{err && <p role="alert" className="mt-2 text-[13px] text-[var(--danger)]">{err}</p>}</div>;
}
