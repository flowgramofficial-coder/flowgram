import Link from "next/link";
import { consumeVerification } from "@/lib/auth";

export const metadata = { title: "Verifying email" };
export const dynamic = "force-dynamic";

export default async function Confirm({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ok = /^[A-Za-z0-9_-]{43}$/.test(token) && (await consumeVerification(token));
  return (
    <main className="mx-auto flex min-h-dvh max-w-[420px] flex-col justify-center px-4">
      <h1 className="text-[26px]">{ok ? "Email confirmed" : "This link has expired"}</h1>
      <p className="mt-3 text-[var(--ink-2)]">{ok ? "You can now set up your first automation." : "Sign in and we'll send you a new confirmation link."}</p>
      <Link href={ok ? "/app" : "/login"} className="btn btn-primary mt-6 w-fit">{ok ? "Open dashboard" : "Sign in"}</Link>
    </main>
  );
}
