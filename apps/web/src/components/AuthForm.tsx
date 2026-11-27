"use client";

import Link from "next/link";
import { useActionState, useCallback, useEffect, useState } from "react";
import type { FormState } from "@/actions/auth";
import { BrandLogo } from "./BrandLogo";
import { LandingBackdrop } from "./LandingBackdrop";

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function AuthForm({ action, mode, nonce }: { action: (s: FormState, f: FormData) => Promise<FormState>; mode: "login" | "signup"; nonce?: string }) {
  const [state, run, pending] = useActionState(action, undefined);
  const [showPw, setShowPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [pw, setPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [localErr, setLocalErr] = useState<string | null>(null);

  const [challenge, setChallenge] = useState<{ question: string; token: string } | null>(null);
  const [challengeAnswer, setChallengeAnswer] = useState("");

  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  const loadChallenge = useCallback(async () => {
    if (siteKey) return;
    try {
      const res = await fetch("/api/auth/captcha", { cache: "no-store" });
      if (res.ok) {
        setChallenge((await res.json()) as { question: string; token: string });
        setChallengeAnswer("");
      }
    } catch {
      // ignore
    }
  }, [siteKey]);

  useEffect(() => {
    void loadChallenge();
  }, [loadChallenge, state?.error]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    setLocalErr(null);
    if (mode === "signup") {
      if (pw !== confirmPw) {
        e.preventDefault();
        setLocalErr("Passwords do not match.");
        return;
      }
      if (!acceptedTerms) {
        e.preventDefault();
        setLocalErr("You must accept the Terms & Conditions to create an account.");
        return;
      }
    }
    if (!siteKey && !challengeAnswer.trim()) {
      e.preventDefault();
      setLocalErr("Please solve the human verification challenge.");
    }
  };

  const handleGoogleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (mode === "signup" && !acceptedTerms) {
      e.preventDefault();
      setLocalErr("Please accept the Terms & Conditions before signing up with Google.");
    }
  };

  const errMsg = localErr ?? state?.error;

  return (
    <div className="relative flex min-h-dvh items-center justify-center px-4 py-10">
      <LandingBackdrop />
      <main className="fg-page-enter panel relative z-10 w-full max-w-[430px] p-6 sm:p-8">
        <BrandLogo className="mb-8 self-start" />
        <h1 className="text-[26px]">{mode === "login" ? "Sign in" : "Create your account"}</h1>

        <a
          href={`/api/auth/google?mode=${mode}${mode === "signup" && acceptedTerms ? "&acceptedTerms=1" : ""}`}
          onClick={handleGoogleClick}
          className="mt-6 flex w-full items-center justify-center gap-2.5 rounded-full border border-[var(--hair-strong)] bg-[var(--recess)] px-4 py-2.5 text-[13px] font-medium text-[var(--ink)] transition-colors hover:border-[#E1306C]"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
            <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z" />
            <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z" />
            <path fill="#FBBC05" d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z" />
            <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z" />
          </svg>
          <span>{mode === "login" ? "Continue with Google" : "Sign up with Google"}</span>
        </a>

        <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-wider text-[var(--ink-3)]">
          <span className="h-px flex-1 bg-[var(--hair)]" />
          <span>or email</span>
          <span className="h-px flex-1 bg-[var(--hair)]" />
        </div>

        <form action={run} onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label htmlFor="email" className="label">Email</label>
            <input id="email" name="email" type="email" autoComplete="email" required className="field mt-1" />
          </div>

          <div>
            <label htmlFor="password" className="label">Password</label>
            <div className="relative mt-1">
              <input
                id="password"
                name="password"
                type={showPw ? "text" : "password"}
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                minLength={mode === "signup" ? 10 : undefined}
                required
                className="field pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                aria-label={showPw ? "Hide password" : "Show password"}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-[var(--ink-3)] hover:text-[var(--ink)]"
              >
                <EyeIcon open={showPw} />
              </button>
            </div>
            {mode === "signup" && <p className="hint mt-1">At least 10 characters.</p>}
          </div>

          {mode === "signup" && (
            <div>
              <label htmlFor="confirmPassword" className="label">Confirm password</label>
              <div className="relative mt-1">
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showConfirmPw ? "text" : "password"}
                  value={confirmPw}
                  onChange={(e) => setConfirmPw(e.target.value)}
                  autoComplete="new-password"
                  minLength={10}
                  required
                  className="field pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPw((v) => !v)}
                  aria-label={showConfirmPw ? "Hide confirm password" : "Show confirm password"}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-[var(--ink-3)] hover:text-[var(--ink)]"
                >
                  <EyeIcon open={showConfirmPw} />
                </button>
              </div>
            </div>
          )}

          {/* Real Human Verification: Cloudflare Turnstile OR Server-Signed HMAC Challenge */}
          {siteKey ? (
            <div className="rounded-[10px] border border-[var(--hair)] bg-[var(--recess)] p-3">
              <div className="mb-2 text-[11px] font-medium text-[var(--ink-2)]">Human verification</div>
              <div className="cf-turnstile" data-sitekey={siteKey} />
            </div>
          ) : (
            <div className="rounded-[10px] border border-[var(--hair)] bg-[var(--recess)] p-3 space-y-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-medium text-[var(--ink-2)]">Human verification</span>
                <button type="button" onClick={() => void loadChallenge()} className="text-[#E1306C] hover:underline">New challenge</button>
              </div>
              <input type="hidden" name="challengeToken" value={challenge?.token ?? ""} />
              <div className="flex items-center gap-2.5">
                <span className="mono shrink-0 text-xs font-semibold">{challenge ? challenge.question : "Loading…"}</span>
                <input
                  name="challengeAnswer"
                  type="text"
                  inputMode="numeric"
                  value={challengeAnswer}
                  onChange={(e) => setChallengeAnswer(e.target.value)}
                  placeholder="Answer"
                  required
                  className="field h-8 text-xs"
                />
              </div>
            </div>
          )}

          {/* Mandatory Terms & Conditions on Signup */}
          {mode === "signup" && (
            <label className="flex cursor-pointer items-start gap-2.5 text-xs text-[var(--ink-2)] select-none">
              <input
                type="checkbox"
                name="acceptTerms"
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
                required
                className="mt-0.5 h-4 w-4 shrink-0 accent-[#E1306C]"
              />
              <span>
                I have read and agree to the{" "}
                <Link href="/terms" target="_blank" className="font-semibold text-[#E1306C] underline">
                  Terms &amp; Conditions
                </Link>
                . (Required to create an account)
              </span>
            </label>
          )}

          {errMsg && <p role="alert" className="text-[13px] text-[var(--danger)]">{errMsg}</p>}

          <button className="btn btn-primary w-full" disabled={pending}>
            {pending ? (mode === "login" ? "Signing in…" : "Creating account…") : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>

        <p className="hint mt-6">
          {mode === "login" ? (
            <>New here? <Link className="underline" href="/signup">Create an account</Link></>
          ) : (
            <>Already have an account? <Link className="underline" href="/login">Sign in</Link></>
          )}
        </p>
        {siteKey && <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer nonce={nonce} />}
      </main>
    </div>
  );
}
