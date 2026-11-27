"use client";
import { useActionState } from "react";
import { verifyTotpAction } from "@/actions/auth";

export default function TwoFactor() {
  const [state, run, pending] = useActionState(verifyTotpAction, undefined);
  return (
    <main className="mx-auto flex min-h-dvh max-w-[380px] flex-col justify-center px-4">
      <h1 className="text-[26px]">Enter your code</h1>
      <p className="hint mt-2">Open your authenticator app and enter the 6-digit code for FlowGram.</p>
      <form action={run} className="mt-6 space-y-4">
        <input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required aria-label="6-digit code" className="field mono text-[18px] tracking-[0.3em]" autoFocus />
        {state?.error && <p role="alert" className="text-[13px] text-[var(--danger)]">{state.error}</p>}
        <button className="btn btn-primary w-full" disabled={pending}>{pending ? "Checking…" : "Verify"}</button>
      </form>
    </main>
  );
}
