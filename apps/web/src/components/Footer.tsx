"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { HELP_PAGES, LINKS, SITE_PAGES, SOCIALS } from "@/lib/links";

export function Footer() {
  const [clock, setClock] = useState("00:00:00");
  useEffect(() => {
    const update = () => setClock(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    update();
    const id = window.setInterval(update, 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <footer className="w-full border-t border-[var(--hair)] bg-[var(--canvas)] pt-14 pb-10">
      <div className="w-full px-5 sm:px-8 lg:px-12">
        <div className="grid gap-12 lg:grid-cols-[1.2fr_1fr]">
          <div className="flex flex-col justify-between gap-10">
            <div>
              <a href={`mailto:${LINKS.supportEmail}`} className="text-lg font-medium hover:text-[#E1306C] sm:text-xl">{LINKS.supportEmail}</a>
              <div className="mt-1 text-xs text-[var(--ink-2)]">India · Global Creator Automation</div>
            </div>
            <div>
              <div className="mono text-[11px] uppercase tracking-wider text-[var(--ink-2)]">Local Time · Live</div>
              <div className="mono mt-1 text-4xl font-light tracking-tight tabular-nums sm:text-5xl">{clock}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            <div>
              <div className="text-xs font-semibold text-[var(--ink-2)]">Socials</div>
              <ul className="mt-3 space-y-2 text-xs">
                {SOCIALS.map((s) => (
                  <li key={s.label}>
                    <a href={s.href} target="_blank" rel="noopener noreferrer" className="hover:text-[#E1306C]">{s.label}</a>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="text-xs font-semibold text-[var(--ink-2)]">Pages</div>
              <ul className="mt-3 space-y-2 text-xs">
                {SITE_PAGES.map((p) => (
                  <li key={p.href}>
                    <Link href={p.href} className="hover:text-[#E1306C]">{p.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="text-xs font-semibold text-[var(--ink-2)]">Help &amp; Legal</div>
              <ul className="mt-3 space-y-2 text-xs">
                {HELP_PAGES.map((p) => (
                  <li key={p.href}>
                    <Link href={p.href} className="hover:text-[#E1306C]">{p.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-12 border-t border-[var(--hair)] pt-6 text-[11px] text-[var(--ink-2)]">
          FlowGram © {new Date().getFullYear()}. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
