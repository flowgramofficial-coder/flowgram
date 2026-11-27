# FlowGram

Instagram comment-to-DM automation, a first-time DM welcome bot, and a Pro AI persona. Multi-tenant, with Postgres row-level security. See `VERIFICATION.md` for what was tested and what was not.

```
apps/web               Next.js 16 dashboard, auth, billing, Instagram OAuth
apps/webhook-ingestor  Fastify; verifies signatures and enqueues, never touches the DB
apps/worker            BullMQ workers: comment rules, welcome bot, AI persona, Stripe events, maintenance
packages/{db,queue,ig-client,ai-engine,security,shared}
infra/{docker,k8s,load-tests}
```

## Run locally
```bash
cp .env.example .env            # fill in Meta, Stripe, Anthropic and embedding keys
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # -> LOCAL_KEK_BASE64
docker compose up -d            # Postgres (pgvector), PgBouncer, Valkey
corepack enable && pnpm install
pnpm build
pnpm db:migrate                 # uses DATABASE_DIRECT_URL (bypasses PgBouncer)
pnpm --filter @flowgram/web dev
pnpm --filter @flowgram/webhook-ingestor start
pnpm --filter @flowgram/worker start
```
Point your Meta app's webhook at `POST /webhooks/instagram` (subscribe to `comments` and `messages`) and your Stripe webhook at `POST /webhooks/stripe`. Set `OPS_TOKEN` (32+ chars) to enable the dead-letter replay endpoint at `/api/ops/dlq`.

## Test
```bash
export TEST_DATABASE_APP_URL=postgres://flowgram_app:flowgram_app@localhost:5432/flowgram
export TEST_DATABASE_OWNER_URL=postgres://flowgram_owner:flowgram_owner@localhost:5432/flowgram
export TEST_VALKEY_URL=redis://localhost:6379
pnpm test        # with CI=true, missing services fail instead of skipping
```

## Design notes
- The workspace id comes only from the server-side session. Every query runs in a transaction that sets `app.current_workspace_id`, and the app database role cannot bypass RLS.
- Sends are at-most-once on ambiguous failures (a duplicate DM to a follower is worse than a missed one); Meta redeliveries are deduplicated at three layers.
- The Pro gate is enforced in the database row on the server (web actions and workers). The UI lock is cosmetic.
