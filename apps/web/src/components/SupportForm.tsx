"use client";
import { useState } from "react";

/** Builds a mailto: link, so the request goes from the person's own email client. Nothing is sent to our servers. */
export function SupportForm({ to }: { to: string }) {
  const [topic, setTopic] = useState("Comment rules");
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  const [opened, setOpened] = useState(false);
  const href = `mailto:${to}?subject=${encodeURIComponent(`[${topic}] FlowGram support request`)}&body=${encodeURIComponent(`${msg}\n\nReply to: ${email}`)}`;
  return (
    <form className="panel space-y-4 p-5" onSubmit={(e) => { e.preventDefault(); window.location.href = href; setOpened(true); }}>
      <div><label htmlFor="s-topic" className="label">What do you need help with?</label>
        <select id="s-topic" className="field mt-1" value={topic} onChange={(e) => setTopic(e.target.value)}>
          {["Comment rules", "Welcome message", "AI persona", "Connecting Instagram", "Billing", "Sign-in or 2FA", "Something else"].map((t) => <option key={t}>{t}</option>)}
        </select></div>
      <div><label htmlFor="s-email" className="label">Your email</label><input id="s-email" type="email" required className="field mt-1" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></div>
      <div><label htmlFor="s-msg" className="label">What happened?</label><textarea id="s-msg" required rows={5} maxLength={4000} className="field mt-1" value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="What you expected, what you saw, and your Instagram handle." /></div>
      <div className="flex items-center gap-3"><button className="btn btn-primary">Email support</button>{opened && <p role="status" className="hint">Your email app should open with the message filled in. If it didn&apos;t, write to {to}.</p>}</div>
    </form>
  );
}
