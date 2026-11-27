"use client";

import { useEffect, useState } from "react";

export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem("fg_cookie_consent")) {
        setVisible(true);
      }
    } catch {
      setVisible(true);
    }
  }, []);

  const choose = (level: "essential" | "all") => {
    try {
      localStorage.setItem("fg_cookie_consent", level);
      document.cookie = `fg_cookie_consent=${level}; path=/; max-age=31536000; SameSite=Lax`;
    } catch {
      // ignore storage errors
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-[680px] rounded-2xl border border-[var(--hair-strong)] bg-[var(--panel)] p-4 shadow-2xl sm:p-5"
    >
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="space-y-1">
          <div className="text-xs font-semibold">Cookie Preferences</div>
          <p className="text-xs text-[var(--ink-2)]">
            FlowGram uses essential cookies for secure sign-in and optional cookies to remember your theme and preferences.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={() => choose("essential")} className="btn h-8 px-3 text-xs">
            Essential only
          </button>
          <button type="button" onClick={() => choose("all")} className="btn btn-primary h-8 px-4 text-xs">
            Accept all
          </button>
        </div>
      </div>
    </div>
  );
}
