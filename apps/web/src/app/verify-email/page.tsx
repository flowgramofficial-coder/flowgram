import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

export const metadata = { title: "Verify your email" };

export default async function VerifyEmail() {
  const s = await getSession();
  if (!s) redirect("/login");
  if (s.emailVerified) redirect("/app");
  return (
    <main className="mx-auto flex min-h-dvh max-w-[420px] flex-col justify-center px-4">
      <h1 className="text-[26px]">Check your email</h1>
      <p className="mt-3 text-[var(--ink-2)]">We sent a confirmation link to <b className="font-semibold text-[var(--ink)]">{s.email}</b>. Open it to start using FlowGram. The link works for 24 hours.</p>
    </main>
  );
}
