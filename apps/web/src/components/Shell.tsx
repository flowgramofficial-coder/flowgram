"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { MotionConfig, motion } from "motion/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { logOutAction } from "@/actions/auth";
import { BrandLogo } from "./BrandLogo";
import { LandingBackdrop } from "./LandingBackdrop";
import { NotificationCenter } from "./NotificationCenter";
import { SPRING } from "./Simulator";

const NAV = [
  { href: "/app", label: "Overview" },
  { href: "/app/rules", label: "Comment rules" },
  { href: "/app/welcome", label: "Welcome message" },
  { href: "/app/persona", label: "AI persona", pro: true },
  { href: "/app/billing", label: "Plan and billing" },
  { href: "/app/settings", label: "Settings" },
] as const;

export function Shell({ children, email, plan, handle }: { children: React.ReactNode; email: string; plan: "free" | "pro"; handle: string | null }) {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    const on = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); } };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);
  useEffect(() => { try { setCollapsed(localStorage.getItem("fg:rail") === "1"); } catch { /* storage unavailable */ } }, []);
  const toggle = () => setCollapsed((c) => { try { localStorage.setItem("fg:rail", c ? "0" : "1"); } catch { /* ignore */ } return !c; });

  const results = useMemo(() => NAV.filter((n) => n.label.toLowerCase().includes(q.toLowerCase())), [q]);
  const active = (h: string) => (h === "/app" ? path === "/app" : path.startsWith(h));

  return (
    <MotionConfig reducedMotion="user" transition={SPRING}>
      <div className="relative min-h-dvh md:grid" style={{ gridTemplateColumns: `${collapsed ? "64px" : "240px"} 1fr`, transition: "grid-template-columns 180ms cubic-bezier(.2,.8,.2,1)" }}>
        <LandingBackdrop />
        <aside className="hidden border-r border-[var(--hair)] bg-[var(--panel)] md:flex md:flex-col" aria-label="Main">
          <div className={`flex h-14 items-center border-b border-[var(--hair)] ${collapsed ? "justify-center px-0" : "justify-between px-4"}`}>
            <BrandLogo href="/app" collapsed={collapsed} size={collapsed ? 30 : 28} />
            {!collapsed && <RailToggle collapsed={collapsed} onClick={toggle} />}
          </div>
          {collapsed && <div className="flex justify-center pt-2"><RailToggle collapsed onClick={toggle} /></div>}
          <nav className="flex-1 space-y-0.5 p-2">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} aria-current={active(n.href) ? "page" : undefined} title={collapsed ? n.label : undefined}
                className="relative flex h-9 items-center rounded-lg px-3 text-[13.5px] font-medium text-[var(--ink-2)] transition-colors hover:text-[var(--ink)] aria-[current=page]:text-[var(--ink)]">
                {active(n.href) && <motion.span layoutId="rail-pill" className="absolute inset-0 rounded-lg bg-[#E1306C]/12 ring-1 ring-[#E1306C]/40" />}
                <span className="relative flex w-full items-center justify-between">
                  <span className={collapsed ? "sr-only" : ""}>{n.label}</span>
                  {collapsed && <span aria-hidden className="mx-auto font-display text-[13px]">{n.label[0]}</span>}
                  {!collapsed && "pro" in n && plan !== "pro" && <span className="mono rounded border border-[var(--hair-strong)] px-1.5 text-[10px] text-[var(--ink-3)]">Pro</span>}
                </span>
              </Link>
            ))}
          </nav>
          {!collapsed && (
            <div className="border-t border-[var(--hair)] p-3 text-[12px]">
              <p className="truncate text-[var(--ink-2)]">{email}</p>
              <form action={logOutAction}><button className="mt-1 text-[var(--ink-3)] underline-offset-2 hover:underline">Sign out</button></form>
            </div>
          )}
        </aside>

        <div className="min-w-0">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-[var(--hair)] bg-[color-mix(in_srgb,var(--canvas)_88%,transparent)] px-4 backdrop-blur-sm">
            <nav className="flex gap-1 overflow-x-auto md:hidden" aria-label="Main (mobile)">
              {NAV.map((n) => <Link key={n.href} href={n.href} aria-current={active(n.href) ? "page" : undefined} className="btn btn-ghost h-8 shrink-0 px-2 text-[13px] aria-[current=page]:bg-[var(--recess)]">{n.label}</Link>)}
            </nav>
            <button onClick={() => setOpen(true)} className="btn ml-auto hidden h-8 w-64 justify-between text-[var(--ink-3)] md:inline-flex" aria-label="Open command palette">
              <span>Search or jump to…</span><kbd className="kbd">⌘K</kbd>
            </button>
            <NotificationCenter />
            <span className="hidden items-center gap-2 text-[12px] text-[var(--ink-2)] md:flex">
              <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: handle ? "var(--ok)" : "var(--ink-3)" }} />
              {handle ? `@${handle}` : "No account connected"}
            </span>
          </header>
          <motion.main key={path} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={SPRING} className="mx-auto w-full max-w-[1440px] p-4 sm:p-6 lg:px-8">{children}</motion.main>
        </div>
      </div>

      <Dialog.Root open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQ(""); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30" />
          <Dialog.Content asChild aria-describedby={undefined}>
            <motion.div initial={{ opacity: 0, scale: 0.98, y: -8 }} animate={{ opacity: 1, scale: 1, y: 0 }} className="panel fixed left-1/2 top-[18vh] z-50 w-[min(520px,calc(100vw-32px))] -translate-x-1/2 p-2">
              <Dialog.Title className="sr-only">Command palette</Dialog.Title>
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Jump to a page" className="field mb-2"
                onKeyDown={(e) => { if (e.key === "Enter" && results[0]) { router.push(results[0].href); setOpen(false); } }} aria-label="Jump to a page" />
              <ul>{results.map((r) => <li key={r.href}><button className="btn btn-ghost h-9 w-full justify-start" onClick={() => { router.push(r.href); setOpen(false); }}>{r.label}</button></li>)}
                {results.length === 0 && <li className="hint p-3">No pages match “{q}”.</li>}</ul>
            </motion.div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </MotionConfig>
  );
}

function RailToggle({ collapsed, onClick }: { collapsed: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="btn btn-ghost h-8 w-8 p-0" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-pressed={collapsed}>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden><rect x="2" y="3" width="12" height="10" rx="2" /><path d="M6 3v10" /></svg>
    </button>
  );
}
