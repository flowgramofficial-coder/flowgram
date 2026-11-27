"use client";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState, useTransition } from "react";
import { saveWelcome } from "@/actions/config";
import { SavedBadge, Toggle } from "./RulesStudio";

export interface WelcomeData { isActive: boolean; delaySeconds: number; messageTemplate: string; icebreakers: Array<{ id: string; title: string; reply: string }> }

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "option";

export function WelcomeEditor({ igAccountId, handle, initial }: { igAccountId: string; handle: string; initial: WelcomeData }) {
  const [d, setD] = useState(initial);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [err, setErr] = useState<string | null>(null);
  const [tapped, setTapped] = useState<string | null>(null);
  const [, start] = useTransition();
  const reduce = useReducedMotion();
  const [typing, setTyping] = useState(true);

  useEffect(() => { setTyping(true); const t = setTimeout(() => setTyping(false), reduce ? 0 : Math.min(2200, 600 + d.delaySeconds * 120)); return () => clearTimeout(t); }, [d.messageTemplate, d.delaySeconds, reduce]);

  const save = () => {
    setStatus("saving"); setErr(null);
    // ids stay stable once created; new options derive theirs from the title, de-duplicated
    const seen = new Set<string>();
    const icebreakers = d.icebreakers.map((i) => { let id = i.id || slug(i.title); while (seen.has(id)) id += "-2"; seen.add(id); return { ...i, id }; });
    start(async () => {
      const r = await saveWelcome({ igAccountId, ...d, icebreakers });
      if (!r.ok) { setErr(r.error); setStatus("error"); return; }
      setD((x) => ({ ...x, icebreakers })); setStatus("saved"); setTimeout(() => setStatus("idle"), 2200);
    });
  };
  const setIb = (i: number, p: Partial<WelcomeData["icebreakers"][number]>) => setD((x) => ({ ...x, icebreakers: x.icebreakers.map((b, j) => (j === i ? { ...b, ...p } : b)) }));
  const tap = d.icebreakers.find((i) => i.id === tapped);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <form className="panel space-y-5 p-5" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <div className="flex items-center justify-between">
          <div><h2 className="text-[18px]">Greet first-time messagers</h2><p className="hint">Sent once, the first time someone messages you.</p></div>
          <div className="flex items-center gap-3"><SavedBadge state={status} /><Toggle checked={d.isActive} onChange={(v) => setD({ ...d, isActive: v })} label="Welcome message is on" /></div>
        </div>
        <div><label htmlFor="wm" className="label">Message</label><textarea id="wm" required rows={4} maxLength={1000} value={d.messageTemplate} onChange={(e) => setD({ ...d, messageTemplate: e.target.value })} className="field mt-1" /></div>
        <div>
          <label htmlFor="delay" className="label">Wait before sending: <span className="num">{d.delaySeconds}s</span></label>
          <input id="delay" type="range" min={0} max={120} step={1} value={d.delaySeconds} onChange={(e) => setD({ ...d, delaySeconds: Number(e.target.value) })} className="mt-2 w-full accent-[var(--accent)]" />
          <p className="hint">A short pause feels more human than an instant reply.</p>
        </div>
        <fieldset>
          <legend className="label mb-2">Quick replies (up to 4)</legend>
          <div className="space-y-2">
            {d.icebreakers.map((b, i) => (
              <div key={i} className="grid gap-2 rounded-lg border border-[var(--hair)] p-3 sm:grid-cols-[160px_1fr_auto]">
                <input aria-label="Button text" maxLength={20} required value={b.title} onChange={(e) => setIb(i, { title: e.target.value, id: b.id || slug(e.target.value) })} className="field" placeholder="Pricing" />
                <input aria-label="Reply when tapped" maxLength={1000} required value={b.reply} onChange={(e) => setIb(i, { reply: e.target.value })} className="field" placeholder="What they get when they tap it" />
                <button type="button" className="btn btn-ghost" onClick={() => setD({ ...d, icebreakers: d.icebreakers.filter((_, j) => j !== i) })} aria-label={`Remove ${b.title || "option"}`}>Remove</button>
              </div>
            ))}
          </div>
          {d.icebreakers.length < 4 && <button type="button" className="btn mt-2" onClick={() => setD({ ...d, icebreakers: [...d.icebreakers, { id: "", title: "", reply: "" }] })}>Add quick reply</button>}
          <p className="hint mt-2">Taps get your written reply straight away. They never go through the AI.</p>
        </fieldset>
        {err && <p role="alert" className="text-[13px] text-[var(--danger)]">{err}</p>}
        <div className="flex justify-end"><button className="btn btn-primary" disabled={status === "saving"}>Save changes</button></div>
      </form>

      <aside className="lg:sticky lg:top-20 lg:h-fit" aria-label="Preview">
        <div className="mx-auto w-[300px] rounded-[36px] border border-[var(--hair-strong)] bg-[var(--panel)] p-[10px]" style={{ boxShadow: "var(--top-light)" }}>
          <div className="flex h-[520px] flex-col overflow-hidden rounded-[27px] bg-[var(--canvas)] pt-9">
            <div className="border-b border-[var(--hair)] px-3 pb-2 text-[12px] font-semibold">{handle}</div>
            <div className="flex flex-1 flex-col justify-end gap-2 p-3 text-[12px]">
              <p className="self-end rounded-2xl rounded-br-md bg-[var(--accent)] px-3 py-2 text-white">Hi! Are you taking new clients?</p>
              <AnimatePresence mode="wait">
                {typing ? (
                  <motion.div key="t" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex w-14 justify-center gap-1 rounded-2xl rounded-bl-md bg-[var(--recess)] py-3" aria-hidden>
                    {[0, 1, 2].map((n) => <motion.span key={n} className="h-1.5 w-1.5 rounded-full bg-[var(--ink-3)]" animate={reduce ? undefined : { y: [0, -3, 0] }} transition={{ duration: 0.9, repeat: Infinity, delay: n * 0.14 }} />)}
                  </motion.div>
                ) : (
                  <motion.div key="m" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="max-w-[88%] self-start">
                    <p className="whitespace-pre-wrap rounded-2xl rounded-bl-md bg-[var(--recess)] px-3 py-2 ring-1 ring-[var(--hair)]">{d.messageTemplate}</p>
                    {d.icebreakers.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{d.icebreakers.filter((b) => b.title).map((b, i) => <button key={i} onClick={() => setTapped(b.id)} className="rounded-full border border-[var(--accent)] px-3 py-1 font-medium text-[var(--accent)]">{b.title}</button>)}</div>}
                  </motion.div>
                )}
              </AnimatePresence>
              {tap && <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="max-w-[88%] self-start whitespace-pre-wrap rounded-2xl rounded-bl-md bg-[var(--recess)] px-3 py-2 ring-1 ring-[var(--hair)]">{tap.reply}</motion.p>}
            </div>
          </div>
        </div>
        <p className="hint mt-3 text-center">Tap a quick reply to see what follows.</p>
      </aside>
    </div>
  );
}
