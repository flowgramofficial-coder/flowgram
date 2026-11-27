"use client";
import QRCode from "qrcode";
import { useActionState, useMemo, useState, useTransition } from "react";
import { confirmTotpAction, startTotpAction, type FormState } from "@/actions/auth";

/** QR drawn as an inline SVG path from the module matrix: generated here, no image URL, no HTML injection. */
function QrSvg({ text }: { text: string }) {
  const { size, d } = useMemo(() => {
    const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
    const n = qr.modules.size;
    let path = "";
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.modules.data[y * n + x]) path += `M${x} ${y}h1v1h-1z`;
    return { size: n, d: path };
  }, [text]);
  return (
    <svg role="img" aria-label="QR code for your authenticator app" viewBox={`-2 -2 ${size + 4} ${size + 4}`} shapeRendering="crispEdges" className="h-44 w-44 shrink-0 rounded-lg bg-white p-1 ring-1 ring-[var(--hair-strong)]">
      <rect x="-2" y="-2" width={size + 4} height={size + 4} fill="#fff" /><path d={d} fill="#000" />
    </svg>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-4">
      <span className="num flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--hair-strong)] bg-[var(--recess)] text-[12px]" aria-hidden>{n}</span>
      <div className="min-w-0 flex-1"><h3 className="text-[15px]"><span className="sr-only">Step {n}: </span>{title}</h3><div className="mt-1.5 space-y-3 text-[var(--ink-2)]">{children}</div></div>
    </li>
  );
}

export function TotpSetup({ enabled }: { enabled: boolean }) {
  const [begin, setBegin] = useState<FormState>();
  const [copied, setCopied] = useState(false);
  const [pendingStart, start] = useTransition();
  const [state, confirm, pending] = useActionState(confirmTotpAction, undefined);

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setCopied(false); }
  };

  if (enabled || state?.info) {
    return (
      <div className="space-y-2">
        <p className="flex items-center gap-2 font-medium"><span aria-hidden className="h-2 w-2 rounded-full bg-[var(--ok)]" />Two-factor authentication is on</p>
        <p className="text-[var(--ink-2)]">You&apos;ll be asked for a 6-digit code each time you sign in. To turn it off or move to a new phone, email support from your account address and we&apos;ll reset it after verifying it&apos;s you.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-[var(--ink-2)]">Two-factor authentication asks for a code from your phone as well as your password, so someone who learns your password still can&apos;t get into your Instagram automations or billing.</p>
      {!begin?.secret ? (
        <button className="btn btn-primary" disabled={pendingStart} onClick={() => start(async () => setBegin(await startTotpAction()))}>{pendingStart ? "Preparing…" : "Set up two-factor authentication"}</button>
      ) : (
        <form action={confirm}>
          <ol className="space-y-6">
            <Step n={1} title="Open an authenticator app">
              <p>On your phone, open or install <b className="font-medium text-[var(--ink)]">Google Authenticator</b>, <b className="font-medium text-[var(--ink)]">Microsoft Authenticator</b>, <b className="font-medium text-[var(--ink)]">Authy</b> or <b className="font-medium text-[var(--ink)]">1Password</b>, then choose to add a new account.</p>
            </Step>
            <Step n={2} title="Scan the QR code or copy the key">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                {begin.otpauth && <QrSvg text={begin.otpauth} />}
                <div className="min-w-0 space-y-2">
                  <p>Can&apos;t scan? Choose “Enter a setup key” in your app and paste this key.</p>
                  <code className="block break-all rounded-lg bg-[var(--recess)] p-3 text-[13px] text-[var(--ink)]">{begin.secret}</code>
                  <button type="button" className="btn h-8" onClick={() => copy(begin.secret!)}>{copied ? "Copied!" : "Copy key"}</button>
                  <span role="status" className="sr-only">{copied ? "Key copied to clipboard" : ""}</span>
                </div>
              </div>
            </Step>
            <Step n={3} title="Enter the 6-digit code">
              <p>Your app shows a new 6-digit code every 30 seconds. Type the current one below, then press <b className="font-medium text-[var(--ink)]">Turn on 2FA</b>.</p>
              <input name="code" inputMode="numeric" pattern="\d{6}" maxLength={6} required autoComplete="one-time-code" aria-label="6-digit code" className="field mono w-40 tracking-[0.3em]" />
              {state?.error && <p role="alert" className="text-[13px] text-[var(--danger)]">{state.error}</p>}
              <div><button className="btn btn-primary" disabled={pending}>{pending ? "Checking…" : "Turn on 2FA"}</button></div>
            </Step>
          </ol>
        </form>
      )}
    </div>
  );
}
