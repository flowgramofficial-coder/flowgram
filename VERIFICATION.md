# FlowGram verification report

Run in a sandbox on 2026-11-25. Everything below was executed, not assumed. The "Not verified" section lists what could not be.

## Results

| Check | Result |
| --- | --- |
| `pnpm build` (turbo, 9 tasks) | pass |
| `pnpm typecheck` (TypeScript 7.0.2, `strict`, `noUncheckedIndexedAccess`; 15 tasks) | pass |
| `pnpm lint` (ESLint, 0 warnings allowed) | pass |
| `pnpm audit --audit-level=high` | 0 advisories |
| Tests, with Postgres and Valkey/Redis live (`CI=true pnpm test`) | **109 passed, 0 skipped** (was 99) |
| `next build` (21 routes, incl. /faq /support /terms) | pass |
| Browser run (Playwright) of signup, email verify, dashboard, rule/welcome save, command palette, light, dark and 390px mobile | pass, 0 console errors, no horizontal overflow |
| Load: 1,000 signed webhooks/s for 5 minutes | see below |

### Tests by package
security 8 · shared 13 · db 10 (RLS) · queue 7 · ig-client 4 · ai-engine 12 · webhook-ingestor 13 · worker 33 · web 9 (new).

### Security tests that ran
- **Cross-tenant isolation (RLS, non-owner role):** tenant A cannot read, insert, update or delete tenant B's rows by id; no tenant context returns zero rows; context does not leak across pooled transactions; malformed workspace ids are rejected; `audit_logs` is append-only (UPDATE, DELETE and TRUNCATE blocked, except cascade-deleting an erased workspace).
- **Webhook forgery:** missing, wrong-secret, malformed and altered-body signatures give 401 and enqueue nothing; 256 KB body limit gives 413; Stripe bad signature and a replay older than 5 minutes give 401; a downed queue gives 503 so Meta retries.
- **Prompt injection and output safety:** forged delimiters cannot survive; hostile knowledge-base text is neutralised; lookalike and obfuscated domains, markdown links, emails and phone numbers are stripped; prompt-leak output is replaced with a neutral message; the free plan never reaches the LLM.
- **Concurrency and idempotency:** 20 concurrent comments on a 5-DM quota send exactly 5; 3 simultaneous first messages schedule exactly 1 welcome; redelivered comments, DMs and Stripe events do nothing twice; 200 concurrent token-bucket requests grant exactly the capacity.
- **Web:** unauthenticated and cross-origin POSTs return 403 or redirect to login; an unverified user is redirected to verify; verification links are single-use; session cookie is HttpOnly, SameSite=Lax.

### Load test (`infra/load-tests/viral-reel.js`)
k6 is not installed in the sandbox, so the same open-loop workload was run with an equivalent Node generator on a 2-CPU machine that also hosted the ingestor, Valkey and Postgres.

| Metric | Result | Threshold |
| --- | --- | --- |
| Sent / acked 200 | 300,000 / 300,000 | 0 dropped |
| Non-200 and network errors | 0 / 0 | 0 |
| Achieved rate | 999 req/s | 1,000 |
| p50 / p95 / p99 | 1.72 / 3.55 / 5.71 ms | p99 < 50 ms |
| Max | 98 ms (single outlier) | n/a |
| Jobs queued | 300,000 | = sent |
| Postgres connections used by the ingestor | 0 | no exhaustion |

## Problems found and fixed while verifying
1. Phone-number regex let `+1 (555) 123-4567` through the AI output filter.
2. The `audit_logs` append-only trigger blocked deleting a workspace, which would have made account erasure impossible.
3. The AI handoff silently did nothing when the contact row did not exist yet (now an upsert).
4. BullMQ rejects `:` in job ids; the dedup ids use `_`.
5. Unlayered CSS overrode Tailwind utilities (a button stayed centered despite `justify-start`); component classes moved into `@layer components`.
6. `pnpm test` through turbo **silently skipped 41 integration tests** because turbo strips undeclared env vars. Fixed in `turbo.json`, and the suites now throw in CI if their services are missing.
7. Invisible zero-width characters in a regex literal replaced with escapes.
8. Dev-only advisories (2 critical in vitest's tinypool) fixed by upgrading vitest; drizzle-kit's esbuild pinned via a scoped override.

## Not verified (read before shipping)
- **Live third parties.** Nothing was run against real Meta, Stripe, Anthropic or an embeddings provider (no credentials). Instagram request shapes follow Meta's docs, but the Graph API version default (`v26.0` in `packages/ig-client`) and the OAuth authorize URL should be confirmed against your app before launch. Stripe Checkout, Portal and the webhook processor are tested with synthetic events only.
- **Versions.** The sandbox has Node 22, PostgreSQL 16 with pgvector 0.6 and Redis 7.0, not Node 26.13.0, PostgreSQL 19 or Valkey 9.2.0. Migrations are plain SQL and Compose and CI pin the specified images, but they were not exercised on those versions.
- **Containers and cluster.** Docker images were not built (no daemon), Kubernetes manifests were not applied, CI workflow did not run, and Semgrep and gitleaks were not run locally.
- **k6 itself.** The k6 script is unrun; an equivalent generator produced the numbers. Results on production hardware will differ.
- **Token-bucket defaults** (burst 20, 5/s per account) are conservative guesses, not Meta's published limits. Tune them.
- **TypeScript 7.0 vs ESLint.** typescript-eslint does not support TS 7.0 yet, so linting runs in `tools/lint` with its own TypeScript 6.0.3. Everything else compiles with 7.0.2.
- **No web unit tests.** The web app is covered by the browser run above, whose script is not committed to the repo.
- **Email verification** consumes its token on GET, so a mail scanner that prefetches links can use it up (the user can request a new one).
- **Turnstile** fails closed in production if `TURNSTILE_SECRET` is unset, and the widget needs `NEXT_PUBLIC_TURNSTILE_SITE_KEY`.
- **otplib** is pinned to v12 (stable API) rather than the newest major.

## Update: landing, footer, logo, skeletons, rule limits, settings (2026-11-25)

Re-run after the upgrade: build 9/9, typecheck 15/15, lint 0, audit 0 advisories, 109 tests, 0 skipped.

### New automated tests (web, real Postgres under RLS as the non-owner role)
Free: 5 rules in one batch succeed and the 6th is rejected; a batch crossing the limit saves nothing (atomic); bulk-editing 5 existing rules works at the limit; a mixed edit-plus-create batch over the limit rolls the edits back; two simultaneous saves cannot both pass (advisory lock). Pro: 8 created and 12 total, 8 edited in one batch. A plan of pro with a canceled subscription is held to the Free limit. Another tenant's rule id or Instagram account is rejected. Also: `{username}` interpolation tolerates `{Username}` and `{ username }`.

### Browser run (Chromium against `next dev`, 1440px and 390px, light and dark): all checks passed, 0 console errors
Landing width 1,400px container; backdrop animates (grid drift) and is pointer-events none; backdrop is static under `prefers-reduced-motion`; no horizontal scroll at 390px; footer has all 19 links, 7 external ones with `target=_blank rel="noopener noreferrer"`; simulator Reel plays, avatars load, public reply shows `Sent you a DM, sam.eats!` with no literal `{username}`; /faq, /support, /terms render (accordion opens); BrandLogo on landing, sidebar expanded and collapsed, login and signup; rules: quota `0 / 5 rules (Free)`, 5 added in one bulk save, `5 / 5` with upgrade link, Add Another disabled, bulk pause, message and keywords applied to all 5 and persisted, single New rule disabled at the limit, Pro badge `5 rules · Unlimited (Pro)` and 3 more saved; settings: 3-step 2FA with a locally drawn SVG QR (no image URLs), Copy key shows Copied! and the clipboard holds the key, Support/FAQ/Terms buttons, Sign Out clears the session and /app then redirects to /login.

### Not verified for this update
- Skeleton behavior on a real route change: the skeleton layouts were rendered and inspected on a throwaway page (removed), and the DOM nodes were seen during navigation in dev, but I could not exercise the prefetched instant-skeleton path in a production build here, because the production server correctly refuses `KEY_PROVIDER=local` and there is no KMS in the sandbox. Dev mode does not prefetch.
- Terms and FAQ text is written to match the product but is not legal advice; have a lawyer review it. Social handles and `support@flowgram.app` are placeholders in `apps/web/src/lib/links.ts`.
- 2FA cannot be turned off from the UI (there is no disable action); the card says to email support. Adding a self-serve disable needs a password re-check and is a separate change.
- A rule limit applies to adding rules only; a workspace already over 5 after a downgrade can still edit and delete its rules.
