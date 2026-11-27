"use client";
import { motion } from "motion/react";
import { useState, useTransition } from "react";
import { addKnowledge, deleteKnowledge, savePersona } from "@/actions/config";
import { SavedBadge, Toggle } from "./RulesStudio";

export interface PersonaData {
  isActive: boolean; personaName: string; tone: string; emojiLevel: "none" | "light" | "heavy"; responseLength: "short" | "medium" | "long";
  signaturePhrases: string[]; handoffTopics: string[]; allowedDomains: string[];
  activeHoursJson: { days: number[]; start: string; end: string } | null; humanTakeoverPauseHours: number;
}
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const lines = (s: string, max: number) => s.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, max);

function Segmented<T extends string>({ value, options, onChange, name }: { value: T; options: Array<[T, string]>; onChange: (v: T) => void; name: string }) {
  return (
    <div className="inline-flex rounded-lg border border-[var(--hair)] bg-[var(--recess)] p-0.5" role="radiogroup" aria-label={name}>
      {options.map(([v, l]) => (
        <button type="button" key={v} role="radio" aria-checked={value === v} onClick={() => onChange(v)} className="relative h-7 rounded-md px-3 text-[13px] font-medium">
          {value === v && <motion.span layoutId={`seg-${name}`} className="absolute inset-0 rounded-md bg-[var(--panel)] ring-1 ring-[var(--hair-strong)]" />}
          <span className="relative">{l}</span>
        </button>
      ))}
    </div>
  );
}

export function PersonaStudio({ igAccountId, initial, knowledge }: { igAccountId: string; initial: PersonaData; knowledge: Array<{ id: string; topic: string; content: string }> }) {
  const [d, setD] = useState(initial);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [err, setErr] = useState<string | null>(null);
  const [kb, setKb] = useState(knowledge);
  const [topic, setTopic] = useState(""); const [content, setContent] = useState("");
  const [kbErr, setKbErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const save = () => {
    setStatus("saving"); setErr(null);
    start(async () => {
      const r = await savePersona({ igAccountId, ...d });
      if (!r.ok) { setErr(r.error); setStatus("error"); return; }
      setStatus("saved"); setTimeout(() => setStatus("idle"), 2200);
    });
  };
  const addKb = () => {
    setKbErr(null);
    start(async () => {
      const r = await addKnowledge({ igAccountId, topic, content });
      if (!r.ok) { setKbErr(r.error); return; }
      setKb((x) => [{ id: crypto.randomUUID(), topic, content }, ...x]); setTopic(""); setContent("");
    });
  };
  const hours = d.activeHoursJson;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <form className="panel space-y-5 p-5" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <div className="flex items-center justify-between">
          <div><h2 className="text-[18px]">Your AI persona</h2><p className="hint">Answers follower DMs in your voice, using only what you've taught it.</p></div>
          <div className="flex items-center gap-3"><SavedBadge state={status} /><Toggle checked={d.isActive} onChange={(v) => setD({ ...d, isActive: v })} label="AI persona is on" /></div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label htmlFor="pn" className="label">Name it uses</label><input id="pn" required maxLength={60} value={d.personaName} onChange={(e) => setD({ ...d, personaName: e.target.value })} className="field mt-1" /></div>
          <div><label htmlFor="pt" className="label">Tone</label><input id="pt" required maxLength={300} value={d.tone} onChange={(e) => setD({ ...d, tone: e.target.value })} className="field mt-1" placeholder="Warm, playful, short sentences" /></div>
        </div>
        <div className="flex flex-wrap gap-6">
          <div><p className="label mb-1">Emoji</p><Segmented name="emoji" value={d.emojiLevel} onChange={(v) => setD({ ...d, emojiLevel: v })} options={[["none", "None"], ["light", "A few"], ["heavy", "Lots"]]} /></div>
          <div><p className="label mb-1">Reply length</p><Segmented name="length" value={d.responseLength} onChange={(v) => setD({ ...d, responseLength: v })} options={[["short", "Short"], ["medium", "Medium"], ["long", "Long"]]} /></div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label htmlFor="sp" className="label">Phrases you use, one per line</label><textarea id="sp" rows={3} defaultValue={d.signaturePhrases.join("\n")} onChange={(e) => setD({ ...d, signaturePhrases: lines(e.target.value, 10) })} className="field mt-1" /></div>
          <div><label htmlFor="ht" className="label">Hand over to me when the chat mentions</label><textarea id="ht" rows={3} defaultValue={d.handoffTopics.join("\n")} onChange={(e) => setD({ ...d, handoffTopics: lines(e.target.value, 30) })} className="field mt-1" placeholder={"refund\nlegal\npersonal address"} /><p className="hint mt-1">The AI stops, sends a polite note, and flags the chat for you.</p></div>
        </div>
        <div><label htmlFor="ad" className="label">Links it may share, one domain per line</label><textarea id="ad" rows={2} defaultValue={d.allowedDomains.join("\n")} onChange={(e) => setD({ ...d, allowedDomains: lines(e.target.value.toLowerCase(), 20) })} className="field mono mt-1" placeholder="yoursite.com" /><p className="hint mt-1">Any other link is removed from replies before they send.</p></div>

        <div className="space-y-3 border-t border-[var(--hair)] pt-4">
          <div className="flex items-center justify-between"><div><p className="font-medium">Only reply during set hours</p><p className="hint">Outside them, followers wait for you.</p></div>
            <Toggle checked={!!hours} onChange={(v) => setD({ ...d, activeHoursJson: v ? { days: [1, 2, 3, 4, 5], start: "09:00", end: "18:00" } : null })} label="Limit reply hours" /></div>
          {hours && (
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex gap-1" role="group" aria-label="Days">{DAYS.map((n, i) => { const on = hours.days.includes(i); return <button type="button" key={n} aria-pressed={on} onClick={() => { const days = on ? hours.days.filter((x) => x !== i) : [...hours.days, i].sort(); if (days.length) setD({ ...d, activeHoursJson: { ...hours, days } }); }} className="btn h-8 px-2.5 text-[12px]" style={on ? { borderColor: "var(--accent)", color: "var(--accent)", background: "var(--accent-soft)" } : undefined}>{n}</button>; })}</div>
              <input type="time" aria-label="From" value={hours.start} onChange={(e) => setD({ ...d, activeHoursJson: { ...hours, start: e.target.value } })} className="field mono w-[110px]" />
              <span className="hint">to</span>
              <input type="time" aria-label="Until" value={hours.end} onChange={(e) => setD({ ...d, activeHoursJson: { ...hours, end: e.target.value } })} className="field mono w-[110px]" />
            </div>
          )}
          <div><label htmlFor="pause" className="label">If I reply myself, pause the AI for <span className="num">{d.humanTakeoverPauseHours}h</span></label><input id="pause" type="range" min={1} max={168} value={d.humanTakeoverPauseHours} onChange={(e) => setD({ ...d, humanTakeoverPauseHours: Number(e.target.value) })} className="mt-2 w-full accent-[var(--accent)]" /></div>
        </div>
        {err && <p role="alert" className="text-[13px] text-[var(--danger)]">{err}</p>}
        <div className="flex justify-end"><button className="btn btn-primary" disabled={status === "saving"}>Save changes</button></div>
      </form>

      <section className="panel h-fit space-y-4 p-5" aria-labelledby="kb">
        <div><h2 id="kb" className="text-[16px]">What it knows</h2><p className="hint">The AI answers only from these notes. If something isn't here, it says you'll follow up.</p></div>
        <div className="space-y-2">
          <input aria-label="Topic" value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={80} className="field" placeholder="Topic, e.g. Shipping" />
          <textarea aria-label="What to say" value={content} onChange={(e) => setContent(e.target.value)} maxLength={2000} rows={3} className="field" placeholder="Orders ship within 3 business days." />
          {kbErr && <p role="alert" className="text-[13px] text-[var(--danger)]">{kbErr}</p>}
          <button type="button" className="btn w-full" disabled={pending || !topic.trim() || !content.trim()} onClick={addKb}>Add note</button>
        </div>
        <ul className="divide-y divide-[var(--hair)]">
          {kb.map((k) => (
            <li key={k.id} className="flex items-start justify-between gap-3 py-2.5">
              <div className="min-w-0"><p className="font-medium">{k.topic}</p><p className="line-clamp-2 text-[13px] text-[var(--ink-2)]">{k.content}</p></div>
              <button className="btn btn-ghost h-7 px-2 text-[12px]" onClick={() => start(async () => { const r = await deleteKnowledge(k.id); if (r.ok) setKb((x) => x.filter((y) => y.id !== k.id)); })}>Remove</button>
            </li>
          ))}
          {kb.length === 0 && <li className="hint py-3">No notes yet. Add your prices, policies and FAQs.</li>}
        </ul>
      </section>
    </div>
  );
}
