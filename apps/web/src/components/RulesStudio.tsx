"use client";
import * as Switch from "@radix-ui/react-switch";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, useTransition } from "react";
import { deleteRule, saveRule, setRuleActive } from "@/actions/config";
import Link from "next/link";
import { FREE_MAX_COMMENT_RULES } from "@flowgram/shared";
import { RulesBulk } from "./RulesBulk";
import { SPRING, Simulator } from "./Simulator";

export interface RuleRow {
  id: string; igAccountId: string; name: string; isActive: boolean; mediaScope: "specific" | "any"; targetMediaId: string | null;
  matchType: "keywords" | "any"; keywords: string[]; publicReplyEnabled: boolean; publicReplyTemplates: string[];
  dmTemplate: string; ctaLabel: string | null; ctaUrl: string | null; priority: number;
}
type Draft = Omit<RuleRow, "id">;

const blank = (igAccountId: string): Draft => ({
  igAccountId, name: "", isActive: true, mediaScope: "any", targetMediaId: null, matchType: "keywords", keywords: [],
  publicReplyEnabled: false, publicReplyTemplates: [], dmTemplate: "Hi {username}! Here's the link you asked for.", ctaLabel: null, ctaUrl: null, priority: 0,
});

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <Switch.Root checked={checked} onCheckedChange={onChange} aria-label={label}
      className="relative h-5 w-9 shrink-0 rounded-full border border-[var(--hair-strong)] bg-[var(--recess)] transition-colors data-[state=checked]:border-[var(--accent)] data-[state=checked]:bg-[var(--accent)]">
      <Switch.Thumb asChild>
        <motion.span layout transition={SPRING} className="block h-3.5 w-3.5 rounded-full bg-white shadow-[0_0_0_1px_rgba(0,0,0,.12)]" style={{ marginLeft: checked ? 18 : 2 }} />
      </Switch.Thumb>
    </Switch.Root>
  );
}

export function SavedBadge({ state }: { state: "idle" | "saving" | "saved" | "error"; msg?: string }) {
  return (
    <AnimatePresence mode="wait">
      {state !== "idle" && (
        <motion.span key={state} initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} role="status"
          className="hint" style={{ color: state === "error" ? "var(--danger)" : undefined }}>
          {state === "saving" ? "Saving…" : state === "saved" ? "Saved" : "Couldn't save"}
        </motion.span>
      )}
    </AnimatePresence>
  );
}

export function RulesStudio({ accounts, initial, plan }: { accounts: Array<{ id: string; username: string }>; initial: RuleRow[]; plan: "free" | "pro" }) {
  const [bulk, setBulk] = useState(false);
  const [bulkPreview, setBulkPreview] = useState<Draft | null>(null);
  const [rules, setRules] = useState(initial);
  const [sel, setSel] = useState<string | "new" | null>(initial[0]?.id ?? (accounts.length ? "new" : null));
  const acct = accounts[0];
  const current = rules.find((r) => r.id === sel);
  const [draft, setDraft] = useState<Draft | null>(current ? stripId(current) : acct ? blank(acct.id) : null);
  const [kw, setKw] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [err, setErr] = useState<string | null>(null);
  const [, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const pick = (id: string | "new") => { setSel(id); setErr(null); setStatus("idle"); const r = rules.find((x) => x.id === id); setDraft(r ? stripId(r) : acct ? blank(acct.id) : null); };
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));
  const flash = (s: "saved" | "error") => { setStatus(s); clearTimeout(timer.current); timer.current = setTimeout(() => setStatus("idle"), 2200); };

  const addKw = () => { const v = kw.trim(); if (v && draft && !draft.keywords.includes(v)) set("keywords", [...draft.keywords, v].slice(0, 30)); setKw(""); };

  const submit = () => {
    if (!draft) return;
    setStatus("saving"); setErr(null);
    start(async () => {
      const r = await saveRule(draft, sel && sel !== "new" ? sel : undefined);
      if (!r.ok) { setErr(r.error); flash("error"); return; }
      const row = { ...draft, id: r.data!.id };
      setRules((rs) => (rs.some((x) => x.id === row.id) ? rs.map((x) => (x.id === row.id ? row : x)) : [row, ...rs]));
      setSel(row.id); flash("saved");
    });
  };

  const toggleActive = (r: RuleRow, v: boolean) => {
    setRules((rs) => rs.map((x) => (x.id === r.id ? { ...x, isActive: v } : x))); setStatus("saving"); // optimistic
    start(async () => {
      const res = await setRuleActive(r.id, v);
      if (!res.ok) { setRules((rs) => rs.map((x) => (x.id === r.id ? { ...x, isActive: !v } : x))); flash("error"); } else flash("saved");
    });
  };

  const remove = () => {
    if (!sel || sel === "new") return;
    start(async () => {
      const r = await deleteRule(sel);
      if (!r.ok) { setErr(r.error); flash("error"); return; }
      const rest = rules.filter((x) => x.id !== sel); setRules(rest); pick(rest[0]?.id ?? "new");
    });
  };

  if (!acct) return <div className="panel p-6"><h2 className="text-[16px]">Connect Instagram first</h2><p className="hint mt-1">Comment rules run on a connected account.</p><a className="btn btn-primary mt-4" href="/api/instagram/connect">Connect Instagram</a></div>;

  const limit = plan === "free" ? FREE_MAX_COMMENT_RULES : Infinity;
  const atLimit = rules.length >= limit;
  const shown = bulk ? bulkPreview : draft;
  const previewComment = shown?.matchType === "keywords" ? (shown.keywords[0] ?? "keyword") : "love this!";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="inline-flex items-center gap-2 rounded-lg border border-[var(--hair-strong)] bg-[var(--panel)] px-3 py-1.5 text-[13px]" role="status" data-testid="rule-quota">
          {plan === "free" ? <><span className="num font-medium">{rules.length} / {FREE_MAX_COMMENT_RULES}</span> rules (Free){atLimit && <Link href="/app/billing" className="ml-1 font-medium text-[var(--accent)] underline underline-offset-2">Upgrade to Pro for unlimited</Link>}</>
            : <><span className="num font-medium">{rules.length}</span> rules · Unlimited (Pro)</>}
        </p>
        <button type="button" className="btn" aria-pressed={bulk} onClick={() => { setBulk((b) => !b); setBulkPreview(null); }}>{bulk ? "Back to single rule" : "Bulk Add / Edit Mode"}</button>
      </div>
      <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)_320px]">
      {bulk ? (
        <div className="lg:col-span-2"><RulesBulk rules={rules} accountId={acct.id} limit={limit}
          onSaved={(saved) => setRules((rs) => { const byId = new Map(saved.map((x) => [x.id, x])); const kept = rs.map((x) => byId.get(x.id) ?? x); return [...saved.filter((x) => !rs.some((r) => r.id === x.id)), ...kept]; })}
          onDeleted={(ids) => { setRules((rs) => rs.filter((x) => !ids.includes(x.id))); setSel(null); setDraft(null); }}
          onPreview={setBulkPreview} /></div>
      ) : (<>
      <aside className="panel h-fit p-2" aria-label="Rules">
        <button onClick={() => pick("new")} className="btn btn-ghost mb-1 w-full justify-start" aria-current={sel === "new"} disabled={atLimit} title={atLimit ? "You're at the Free limit" : undefined}>New rule</button>
        <ul>
          {rules.map((r) => (
            <li key={r.id} className="relative">
              {sel === r.id && <motion.span layoutId="rule-pill" className="absolute inset-0 rounded-lg bg-[var(--recess)] ring-1 ring-[var(--hair)]" />}
              <div className="relative flex items-center gap-2 px-2 py-1.5">
                <button onClick={() => pick(r.id)} className="min-w-0 flex-1 text-left" aria-current={sel === r.id}>
                  <span className="block truncate text-[13.5px] font-medium">{r.name}</span>
                  <span className="mono block truncate text-[11px] text-[var(--ink-3)]">{r.matchType === "any" ? "any comment" : r.keywords.join(", ")}</span>
                </button>
                <Toggle checked={r.isActive} onChange={(v) => toggleActive(r, v)} label={`${r.name} is on`} />
              </div>
            </li>
          ))}
          {rules.length === 0 && <li className="hint p-3">No rules yet. Write your first one on the right.</li>}
        </ul>
      </aside>

      {draft && (
        <form className="panel space-y-5 p-5" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[18px]">{sel === "new" ? "New rule" : "Edit rule"}</h2>
            <SavedBadge state={status} />
          </div>
          <div><label htmlFor="name" className="label">Rule name</label><input id="name" required maxLength={80} value={draft.name} onChange={(e) => set("name", e.target.value)} className="field mt-1" placeholder="Free guide giveaway" /></div>

          <fieldset className="grid gap-4 sm:grid-cols-2">
            <legend className="label mb-1">When someone comments on</legend>
            <select aria-label="Posts" value={draft.mediaScope} onChange={(e) => set("mediaScope", e.target.value as Draft["mediaScope"])} className="field"><option value="any">Any post or Reel</option><option value="specific">One specific post or Reel</option></select>
            {draft.mediaScope === "specific" && <input aria-label="Media ID" value={draft.targetMediaId ?? ""} onChange={(e) => set("targetMediaId", e.target.value || null)} className="field mono" placeholder="Media ID" required />}
          </fieldset>

          <fieldset>
            <legend className="label mb-1">And the comment</legend>
            <div className="inline-flex rounded-lg border border-[var(--hair)] bg-[var(--recess)] p-0.5" role="radiogroup">
              {(["keywords", "any"] as const).map((m) => (
                <button type="button" key={m} role="radio" aria-checked={draft.matchType === m} onClick={() => set("matchType", m)} className="relative h-7 rounded-md px-3 text-[13px] font-medium">
                  {draft.matchType === m && <motion.span layoutId="match-pill" className="absolute inset-0 rounded-md bg-[var(--panel)] ring-1 ring-[var(--hair-strong)]" />}
                  <span className="relative">{m === "keywords" ? "Contains a keyword" : "Is anything"}</span>
                </button>
              ))}
            </div>
            {draft.matchType === "keywords" && (
              <div className="mt-3">
                <div className="flex flex-wrap gap-1.5">{draft.keywords.map((k) => <span key={k} className="mono inline-flex items-center gap-1 rounded-md border border-[var(--hair-strong)] bg-[var(--recess)] px-2 py-0.5 text-[12px]">{k}<button type="button" aria-label={`Remove ${k}`} onClick={() => set("keywords", draft.keywords.filter((x) => x !== k))} className="text-[var(--ink-3)] hover:text-[var(--ink)]">×</button></span>)}</div>
                <input value={kw} onChange={(e) => setKw(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addKw(); } }} onBlur={addKw} className="field mono mt-2" placeholder="Type a keyword and press Enter" aria-label="Add keyword" />
                <p className="hint mt-1">Whole words only, not case-sensitive. “link” won't match “linkedin”.</p>
              </div>
            )}
          </fieldset>

          <div>
            <label htmlFor="dm" className="label">Send this direct message</label>
            <textarea id="dm" required rows={4} maxLength={1000} value={draft.dmTemplate} onChange={(e) => set("dmTemplate", e.target.value)} className="field mt-1" />
            <p className="hint mt-1">Use <code>{"{username}"}</code> and <code>{"{post_title}"}</code>. <span className="num">{draft.dmTemplate.length}/1000</span></p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label htmlFor="cl" className="label">Button label (optional)</label><input id="cl" maxLength={20} value={draft.ctaLabel ?? ""} onChange={(e) => set("ctaLabel", e.target.value || null)} className="field mt-1" /></div>
            <div><label htmlFor="cu" className="label">Button link</label><input id="cu" type="url" value={draft.ctaUrl ?? ""} onChange={(e) => set("ctaUrl", e.target.value || null)} className="field mono mt-1" placeholder="https://" required={!!draft.ctaLabel} /></div>
          </div>

          <div className="flex items-center justify-between border-t border-[var(--hair)] pt-4">
            <div><p className="font-medium">Also reply publicly under the comment</p><p className="hint">We rotate between your replies so they don't look repeated.</p></div>
            <Toggle checked={draft.publicReplyEnabled} onChange={(v) => set("publicReplyEnabled", v)} label="Reply publicly" />
          </div>
          {draft.publicReplyEnabled && (
            <div><label htmlFor="pr" className="label">Public replies, one per line</label><textarea id="pr" rows={3} value={draft.publicReplyTemplates.join("\n")} onChange={(e) => set("publicReplyTemplates", e.target.value.split("\n").filter((l) => l.trim()).slice(0, 10))} className="field mt-1" placeholder={"Sent you a DM, {username}!\nCheck your inbox, {username}"} /></div>
          )}

          {err && <p role="alert" className="text-[13px] text-[var(--danger)]">{err}{err.startsWith("Free plan allows") && <> <Link className="underline" href="/app/billing">Upgrade to Pro</Link></>}</p>}
          <div className="flex items-center justify-between">
            <button type="button" onClick={remove} className="btn btn-ghost text-[var(--danger)]" disabled={sel === "new"}>Delete rule</button>
            <button className="btn btn-primary" disabled={status === "saving"}>{sel === "new" ? "Create rule" : "Save changes"}</button>
          </div>
        </form>
      )}
      </>)}

      <aside className="lg:sticky lg:top-20 lg:h-fit" aria-label="Preview">
        {shown && <Simulator handle={acct.username} postTitle="Your latest Reel" commenter="alex" comment={previewComment} dm={shown.dmTemplate} publicReply={shown.publicReplyEnabled ? (shown.publicReplyTemplates[0] ?? null) : null} ctaLabel={shown.ctaLabel} />}
        <p className="hint mt-3 text-center">{bulk ? "Click a rule or edit a new row to preview it." : "Preview updates as you type."}</p>
      </aside>
      </div>
    </div>
  );
}

function stripId(r: RuleRow): Draft { const { id: _id, ...d } = r; void _id; return d; }
