import { NextResponse, type NextRequest } from "next/server";

/**
 * Per-request nonce CSP (Next 16 "proxy", formerly middleware). Also gates the dashboard on cookie
 * presence for a fast redirect; real authorisation happens server-side in requireSession().
 */
export function proxy(req: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const dev = process.env.NODE_ENV !== "production";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://challenges.cloudflare.com${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'", // Tailwind/Motion emit inline style attributes; scripts stay nonce-locked
    "img-src 'self' data: blob:",
    "font-src 'self' https://fonts.gstatic.com",
    "connect-src 'self'",
    "frame-src https://challenges.cloudflare.com",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ].join("; ");

  const headers = new Headers(req.headers);
  headers.set("x-nonce", nonce);
  headers.set("content-security-policy", csp);

  if (req.nextUrl.pathname.startsWith("/app") && !req.cookies.get("fg_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("content-security-policy", csp);
  return res;
}

export const config = {
  matcher: [{ source: "/((?!api/webhooks|_next/static|_next/image|favicon.ico).*)", missing: [{ type: "header", key: "next-router-prefetch" }] }],
};
