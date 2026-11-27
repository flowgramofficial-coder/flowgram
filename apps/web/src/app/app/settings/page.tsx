import { eq } from "drizzle-orm";
import { igAccounts, users } from "@flowgram/db";
import Link from "next/link";
import { SignOutButton } from "@/components/SignOutButton";
import { TotpSetup } from "@/components/TotpSetup";
import { read } from "@/lib/tenant";
import { services } from "@/lib/server";

export const metadata = { title: "Settings" };

const MSG: Record<string, string> = {
  connected: "Instagram connected.", denied: "You cancelled the Instagram connection.", invalid_state: "That connection attempt expired. Please try again.",
  already_connected: "That Instagram account is already connected to another workspace.", failed: "We couldn't connect Instagram. Please try again.", missing_code: "Instagram didn't return a code. Please try again.",
};

export default async function Settings({ searchParams }: { searchParams: Promise<{ ig?: string }> }) {
  const { ig } = await searchParams;
  const { accts, totp, email } = await read(async (tx, s) => ({
    email: s.email,
    accts: await tx.select({ id: igAccounts.id, u: igAccounts.username, st: igAccounts.status, exp: igAccounts.tokenExpiresAt, hook: igAccounts.webhookSubscribed }).from(igAccounts),
    totp: (await services().db.select({ t: users.totpEnabled }).from(users).where(eq(users.id, s.userId)).limit(1))[0]?.t ?? false,
  }));
  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-[26px]">Settings</h1>
      {ig && MSG[ig] && <p role="status" className="panel p-4">{MSG[ig]}</p>}
      <section className="panel p-5" aria-labelledby="ig">
        <h2 id="ig" className="text-[16px]">Instagram</h2>
        <ul className="mt-3 divide-y divide-[var(--hair)]">
          {accts.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-4 py-3">
              <div><p className="font-medium">@{a.u}</p><p className="hint">{a.st === "active" ? (a.hook ? "Connected and receiving comments and messages" : "Connected; waiting for Instagram to confirm webhooks") : "Needs to be reconnected"} · renews before <time className="num" dateTime={a.exp.toISOString()}>{a.exp.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</time></p></div>
              {a.st !== "active" && <a className="btn" href="/api/instagram/connect">Reconnect</a>}
            </li>
          ))}
        </ul>
        {accts.length === 0 ? <><p className="hint mt-2">No account connected yet.</p><a className="btn btn-primary mt-3" href="/api/instagram/connect">Connect Instagram</a></> : null}
      </section>
      <section className="panel p-5" aria-labelledby="sec"><h2 id="sec" className="mb-3 text-[16px]">Sign-in security</h2><TotpSetup enabled={totp} /></section>
      <section className="panel p-5" aria-labelledby="help">
        <h2 id="help" className="text-[16px]">Help &amp; Legal</h2>
        <p className="hint mt-1">Answers, a way to reach us, and the terms you agreed to.</p>
        <div className="mt-3 flex flex-wrap gap-2"><Link className="btn" href="/support">Support</Link><Link className="btn" href="/faq">FAQ</Link><Link className="btn" href="/terms">Terms &amp; Conditions</Link></div>
      </section>
      <section className="panel p-5" aria-labelledby="acct">
        <h2 id="acct" className="text-[16px]">Account &amp; Session</h2>
        <p className="hint mt-1">Signed in as {email}. Signing out ends this session on this device.</p>
        <div className="mt-3"><SignOutButton /></div>
      </section>
    </div>
  );
}
