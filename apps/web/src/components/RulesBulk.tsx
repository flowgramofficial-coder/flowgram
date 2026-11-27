"use client";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useId, useMemo, useState, useTransition } from "react";
import { deleteRules, saveRulesBatch } from "@/actions/config";
import type { CommentRuleInput } from "@flowgram/shared";
import { FREE_RULE_LIMIT_MESSAGE } from "@flowgram/shared";
import type { RuleRow } from "./RulesStudio";
import { SPRING } from "./Simulator";

type Draft = Omit<RuleRow, "id">;
interface NewRow { key: string; name: string; matchType: "keywords" | "any"; keywords: string; dm: string }

const toInput = (d: Draft): CommentRuleInput => ({ ...d });
const strip = (r: RuleRow): Draft => { const { id: _id, ...d } = r; void _id; return d; };
const parseKw = (s: string) => [...new Set(s.split(/[,\n]/).map((k) => k.trim()).filter(Boolean))].slice(0, 30);

export function RulesBulk({ rules, accountId, limit, onSaved, onDeleted, onPreview }: {
  rules: RuleRow[]; accountId: string; limit: number;
  onSaved: (rows: RuleRow[]) => void; onDeleted: (ids: string[]) => void; onPreview: (d: Draft) => void;
}) {
  const uid = useId();
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [staged, setStaged] = useState<Record<string, RuleRow>>({});
  const [rows, setRows] = useState<NewRow[]>([]);
  const [dm, setDm] = useState("");
  const [kw, setKw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, startSave] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const view = useMemo(() => rules.map((r) => staged[r.id] ?? r), [rules, staged]);
  const free = Number.isFinite(limit);
  const slots = free ? Math.max(0, limit - rules.length) : Infinity;
  const changes = Object.keys(staged).length + rows.length;
  const anyChecked = checked.size > 0;

  const toggle = (id: string) => setChecked((c) => { const n = new Set(c); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allOn = rules.length > 0 && checked.size === rules.length;
  const patchSelected = (fn: (r: RuleRow) => RuleRow) => setStaged((s) => {
    const n = { ...s };
    for (const r of rules) if (checked.has(r.id)) n[r.id] = fn(n[r.id] ?? r);
    return n;
  });
  const patchOne = (id: string, p: Partial<Draft>) => setStaged((s) => { const base = s[id] ?? rules.find((r) => r.id === id); return base ? { ...s, [id]: { ...base, ...p } } : s; });

  const applyDm = () => { const t = dm.trim(); if (!t) return; patchSelected((r) => ({ ...r, dmTemplate: t.slice(0, 1000) })); setDm(""); setNote(`Message updated on ${checked.size} rule${checked.size === 1 ? "" : "s"}. Press Save All Rules to keep it.`); };
  const applyKw = () => {
    const add = parseKw(kw); if (add.length === 0) return;
    patchSelected((r) => (r.matchType === "keywords" ? { ...r, keywords: [...new Set([...r.keywords, ...add])].slice(0, 30) } : r));
    setKw(""); setNote("Keywords added to the selected keyword rules. Rules that match any comment were left alone. Press Save All Rules to keep it.");
  };

  const addRow = () => { if (rows.length < slots) setRows((r) => [...r, { key: `${uid}-${r.length}-${Date.now()}`, name: "", matchType: "keywords", keywords: "", dm: "Hi {username}! Here's the link you asked for." }]); };
  const setRow = (key: string, p: Partial<NewRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));
  const rowDraft = (r: NewRow): Draft => ({ igAccountId: accountId, name: r.name.trim(), isActive: true, mediaScope: "any", targetMediaId: null, matchType: r.matchType, keywords: parseKw(r.keywords), publicReplyEnabled: false, publicReplyTemplates: [], dmTemplate: r.dm, ctaLabel: null, ctaUrl: null, priority: 0 });

  const save = () => {
    setErr(null); setNote(null);
    const edits = Object.entries(staged).map(([id, r]) => ({ id, rule: toInput(strip(r)) }));
    const creates = rows.map((r) => ({ rule: toInput(rowDraft(r)) }));
    const bad = rows.findIndex((r) => !r.name.trim() || (r.matchType === "keywords" && parseKw(r.keywords).length === 0));
    if (bad >= 0) { setErr(`New rule ${bad + 1} needs a name${rows[bad]?.name.trim() ? " and at least one keyword" : ""}.`); return; }
    startSave(async () => {
      const res = await saveRulesBatch([...edits, ...creates]);
      if (!res.ok) { setErr(res.error); return; }
      const ids = res.data!.ids;
      const saved: RuleRow[] = [...edits.map((e, i) => ({ ...e.rule, id: ids[i]! })), ...creates.map((c, i) => ({ ...c.rule, id: ids[edits.length + i]! }))];
      onSaved(saved); setStaged({}); setRows([]); setChecked(new Set());
      setNote(`Saved ${saved.length} rule${saved.length === 1 ? "" : "s"}.`);
    });
  };

  const removeSelected = () => {
    const ids = [...checked];
    setErr(null);
    startSave(async () => {
      const res = await deleteRules(ids);
      if (!res.ok) { setErr(res.error); return; }
      onDeleted(ids); setStaged((s) => Object.fromEntries(Object.entries(s).filter(([k]) => !ids.includes(k)))); setChecked(new Set()); setConfirmDelete(false);
      setNote(`Deleted ${ids.length} rule${ids.length === 1 ? "" : "s"}.`);
    });
  };

  const limitHit = err === FREE_RULE_LIMIT_MESSAGE;
  return (
    <div className="panel space-y-6 p-5" aria-busy={busy}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-[18px]">Bulk add / edit</h2><p className="hint">Select rules to change them together, or queue several new rules, then save everything at once.</p></div>
        <button type="button" className="btn btn-primary" onClick={save} disabled={busy || changes === 0}>{busy ? "Saving…" : `Save All Rules${changes ? ` (${changes})` : ""}`}</button>
      </div>

      <section aria-labelledby={`${uid}-ex`}>
        <div className="mb-2 flex items-center justify-between"><h3 id={`${uid}-ex`} className="text-[15px]">Your rules</h3>
          {rules.length > 0 && <label className="flex items-center gap-2 text-[13px] text-[var(--ink-2)]"><input type="checkbox" checked={allOn} onChange={() => setChecked(allOn ? new Set() : new Set(rules.map((r) => r.id)))} />Select all</label>}</div>
        {rules.length === 0 ? <p className="hint">No rules yet. Add some below.</p> : (
          <ul className="divide-y divide-[var(--hair)] rounded-lg border border-[var(--hair)]">
            {view.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-3 py-2">
                <input type="checkbox" aria-label={`Select ${r.name}`} checked={checked.has(r.id)} onChange={() => toggle(r.id)} />
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onPreview(strip(r))}>
                  <span className="block truncate text-[13.5px] font-medium">{r.name}{staged[r.id] && <span className="mono ml-2 rounded border border-[var(--accent)] px-1 text-[10px] text-[var(--accent)]">edited</span>}</span>
                  <span className="mono block truncate text-[11px] text-[var(--ink-3)]">{r.matchType === "any" ? "any comment" : r.keywords.join(", ")}</span>
                </button>
                <span className={`text-[12px] ${r.isActive ? "text-[var(--ok)]" : "text-[var(--ink-3)]"}`}>{r.isActive ? "Active" : "Paused"}</span>
                <button type="button" className="btn btn-ghost h-7 px-2 text-[12px]" onClick={() => patchOne(r.id, { isActive: !r.isActive })}>{r.isActive ? "Pause" : "Activate"}</button>
              </li>
            ))}
          </ul>
        )}
        <AnimatePresence initial={false}>
          {anyChecked && (
            <motion.div key="bar" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={SPRING} className="overflow-hidden">
              <div className="mt-3 space-y-3 rounded-lg border border-[var(--hair)] bg-[var(--recess)] p-3">
                <p className="text-[13px] font-medium">{checked.size} selected</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn h-8" onClick={() => patchSelected((r) => ({ ...r, isActive: true }))}>Activate</button>
                  <button type="button" className="btn h-8" onClick={() => patchSelected((r) => ({ ...r, isActive: false }))}>Pause</button>
                  {!confirmDelete ? <button type="button" className="btn h-8 text-[var(--danger)]" onClick={() => setConfirmDelete(true)}>Delete selected</button>
                    : <span className="inline-flex items-center gap-2 text-[13px]">Delete {checked.size} rule{checked.size === 1 ? "" : "s"}?
                      <button type="button" className="btn h-8 border-[var(--danger)] text-[var(--danger)]" onClick={removeSelected} disabled={busy}>Yes, delete</button>
                      <button type="button" className="btn btn-ghost h-8" onClick={() => setConfirmDelete(false)}>Cancel</button></span>}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div><label htmlFor={`${uid}-dm`} className="label">Set the same message on all selected</label>
                    <textarea id={`${uid}-dm`} rows={2} maxLength={1000} className="field mt-1" value={dm} onChange={(e) => setDm(e.target.value)} placeholder="Hi {username}! …" />
                    <button type="button" className="btn mt-2 h-8" onClick={applyDm} disabled={!dm.trim()}>Apply message</button></div>
                  <div><label htmlFor={`${uid}-kw`} className="label">Add keywords to all selected</label>
                    <input id={`${uid}-kw`} className="field mono mt-1" value={kw} onChange={(e) => setKw(e.target.value)} placeholder="guide, link, info" />
                    <button type="button" className="btn mt-2 h-8" onClick={applyKw} disabled={!parseKw(kw).length}>Add keywords</button></div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      <section aria-labelledby={`${uid}-new`}>
        <div className="mb-2 flex items-center justify-between">
          <h3 id={`${uid}-new`} className="text-[15px]">New rules</h3>
          <span className="hint num">{free ? `${Math.max(0, slots - rows.length)} free slot${slots - rows.length === 1 ? "" : "s"} left` : "Unlimited on Pro"}</span>
        </div>
        <ul className="space-y-3">
          <AnimatePresence initial={false}>
            {rows.map((r, i) => (
              <motion.li key={r.key} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98 }} transition={SPRING} className="rounded-lg border border-[var(--hair)] p-3" onFocusCapture={() => onPreview(rowDraft(r))}>
                <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                  <div><label className="label" htmlFor={`${r.key}-n`}>Name</label><input id={`${r.key}-n`} className="field mt-1" maxLength={80} value={r.name} onChange={(e) => setRow(r.key, { name: e.target.value })} placeholder={`Rule ${rules.length + i + 1}`} /></div>
                  <div><label className="label" htmlFor={`${r.key}-k`}>{r.matchType === "keywords" ? "Keywords (comma separated)" : "Matches"}</label>
                    {r.matchType === "keywords" ? <input id={`${r.key}-k`} className="field mono mt-1" value={r.keywords} onChange={(e) => setRow(r.key, { keywords: e.target.value })} placeholder="link, guide" /> : <p className="field mt-1 text-[var(--ink-3)]">Any comment</p>}</div>
                  <div className="flex items-end gap-1">
                    <button type="button" className="btn h-9 px-2 text-[12px]" onClick={() => setRow(r.key, { matchType: r.matchType === "keywords" ? "any" : "keywords" })}>{r.matchType === "keywords" ? "Match any comment" : "Use keywords"}</button>
                    <button type="button" className="btn btn-ghost h-9 w-9 p-0" aria-label={`Remove new rule ${i + 1}`} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>×</button>
                  </div>
                </div>
                <label className="label mt-3 block" htmlFor={`${r.key}-d`}>Direct message</label>
                <textarea id={`${r.key}-d`} className="field mt-1" rows={2} maxLength={1000} value={r.dm} onChange={(e) => setRow(r.key, { dm: e.target.value })} />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" className="btn" onClick={addRow} disabled={rows.length >= slots}>+ Add Another Rule</button>
          {free && slots - rows.length <= 0 && <p className="hint">You&apos;re at the Free limit. <Link className="underline" href="/app/billing">Upgrade to Pro</Link> for unlimited rules.</p>}
        </div>
      </section>

      <div aria-live="polite">
        {err && <p role="alert" className="text-[13px] text-[var(--danger)]">{err}{limitHit && <> <Link className="underline" href="/app/billing">Upgrade to Pro</Link></>}</p>}
        {note && !err && <p role="status" className="hint">{note}</p>}
      </div>
    </div>
  );
}
