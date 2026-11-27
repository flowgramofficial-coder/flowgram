import Link from "next/link";
import { getSession } from "@/lib/session";
import { BrandLogo } from "./BrandLogo";
import { Footer } from "./Footer";
import { LandingBackdrop } from "./LandingBackdrop";

/** Frame for public info pages (FAQ, Support, Terms) matching the Welcome Page theme & animations. */
export async function InfoShell({ title, intro, children, wide = false }: { title: string; intro?: string; children: React.ReactNode; wide?: boolean }) {
  const signedIn = !!(await getSession())?.mfaPassed;
  return (
    <div className="relative min-h-dvh w-full">
      <LandingBackdrop />
      <header className="sticky top-0 z-30 border-b border-[var(--hair)] bg-[var(--canvas)]/80 backdrop-blur-md">
        <div className="flex h-16 w-full items-center justify-between px-5 sm:px-8 lg:px-12">
          <BrandLogo href={signedIn ? "/app" : "/"} />
          <nav className="flex items-center gap-2" aria-label="Account">
            {signedIn ? (
              <Link href="/app" className="btn btn-primary">Back to dashboard</Link>
            ) : (
              <>
                <Link href="/login" className="btn btn-ghost">Sign in</Link>
                <Link href="/signup" className="btn btn-primary">Start free</Link>
              </>
            )}
          </nav>
        </div>
      </header>
      <main className={`fg-page-enter mx-auto w-full ${wide ? "max-w-[1320px]" : "max-w-[920px]"} px-5 py-12 sm:px-8 md:py-16 lg:px-12`}>
        <h1 className="text-[36px] sm:text-[46px]">{title}</h1>
        {intro && <p className="mt-3 max-w-[44rem] text-[16px] text-[var(--ink-2)]">{intro}</p>}
        <div className="mt-8">{children}</div>
      </main>
      <Footer />
    </div>
  );
}
