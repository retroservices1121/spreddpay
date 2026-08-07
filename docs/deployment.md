# Deployment (Railway)

## One project, six services

A Railway **service** runs one process on one port. SpreddPay is six processes,
so it is six services — all inside a **single Railway project**, sharing one
Postgres. They cannot be combined into one service.

Keeping them in the same project is what lets them reach Postgres over Railway's
private network (`postgres.railway.internal`) instead of the public proxy.

| Service | Root directory | Build command | Start command | Public domain |
| --- | --- | --- | --- | --- |
| **landing** *(exists)* | `apps/landing` | — | `npm start` | `spreddpay.com` |
| **api** | `/` | `pnpm install && pnpm db:generate && pnpm --filter @spreddpay/api build` | `pnpm --filter @spreddpay/api start` | `api.spreddpay.com` |
| **web** (trader) | `/` | `pnpm install && pnpm db:generate && pnpm --filter @spreddpay/web build` | `pnpm --filter @spreddpay/web start` | `app.spreddpay.com` |
| **partner** | `/` | `pnpm install && pnpm db:generate && pnpm --filter @spreddpay/partner-portal build` | `pnpm --filter @spreddpay/partner-portal start` | `partner.spreddpay.com` |
| **admin** | `/` | `pnpm install && pnpm db:generate && pnpm --filter @spreddpay/admin build` | `pnpm --filter @spreddpay/admin start` | `admin.spreddpay.com` |
| **worker** | `/` | `pnpm install && pnpm db:generate && pnpm --filter @spreddpay/worker build` | `pnpm --filter @spreddpay/worker start` | none |
| **Postgres** | — | — | — | — |

Notes on the table:

- **landing is the exception.** Its root directory is `apps/landing`, it has zero
  dependencies and no build step. That is deliberate: spreddpay.com cannot be
  taken down by a platform build failure.
- **Everything else uses `/` as the root directory,** because pnpm workspace
  resolution needs the lockfile and `pnpm-workspace.yaml` at the repo root. The
  `--filter` in the build and start commands is what selects the app.
- **`pnpm db:generate` is required in every platform build.** The Prisma client
  is generated, not committed.
- **The worker needs no domain.** It has no HTTP surface.

## Ports

Do not set `PORT`. Railway injects it, and every service honours it:

- The Next.js apps use `next start` with no `--port`, which reads `$PORT`.
- The API's env schema reads `PORT` (defaulting to 4000 locally) and binds
  `0.0.0.0`.
- The landing server reads `process.env.PORT`.

The `--port` flags in the `dev` scripts are for local development only.

## Environment variables

### Every platform service (api, web, partner, admin, worker)

```env
NODE_ENV=production
DATABASE_URL=${{Postgres.DATABASE_URL}}
AUTH_SECRET=<32+ random chars>
ENCRYPTION_KEY=<64 hex chars>
APP_URL=https://app.spreddpay.com
PARTNER_APP_URL=https://partner.spreddpay.com
ADMIN_APP_URL=https://admin.spreddpay.com
API_URL=https://api.spreddpay.com
RAIN_MODE=mock
BLEND_MODE=mock
```

`${{Postgres.DATABASE_URL}}` is Railway's reference syntax — it resolves to the
private-network URL, which is what you want between services in a project.

**`ENCRYPTION_KEY` must be byte-identical across all services.** Encrypted
webhook secrets become undecryptable otherwise. `AUTH_SECRET` likewise, or
sessions issued by one service will not validate in another.

### Additionally on web, partner and admin

```env
NEXT_PUBLIC_API_URL=https://api.spreddpay.com
```

**This is read at build time**, not at runtime — Next.js inlines `NEXT_PUBLIC_*`
into the bundle. Set it before the first build, and redeploy after changing it.

### Optionally on api and worker

```env
REDIS_URL=${{Redis.REDIS_URL}}
```

Without it the worker runs its jobs on in-process intervals, which is fine for
beta. Add a Redis service when you want BullMQ.

`NODE_ENV=production` also makes session cookies `secure`, so every portal must
be served over HTTPS. Railway domains are HTTPS by default.

## Cookies across subdomains

The session cookie is host-only on the API's domain, `SameSite=Lax`, `httpOnly`.
A request from `app.spreddpay.com` to `api.spreddpay.com` is **same-site** —
same registrable domain — so `Lax` permits it and `credentials: "include"`
works. No cookie `domain` attribute is needed.

This breaks if the API is served from a different registrable domain
(e.g. `spreddpay-api.up.railway.app` alongside `app.spreddpay.com`). Either put
everything on `spreddpay.com` subdomains, or the cookie needs
`SameSite=None; Secure`, which is a code change in `apps/api/src/routes/auth.ts`.

CORS is already restricted to `APP_URL`, `PARTNER_APP_URL` and `ADMIN_APP_URL`,
so those must be the real public URLs or the browser will block requests.

## First deploy, in order

1. **Postgres** — add it to the project first.
2. **api** — deploy, then run the migration once against it:
   `pnpm db:push` locally with `DATABASE_URL` set to the *public* proxy URL, or
   a Railway one-off command. Check `GET /api/v1/health`.
3. **worker** — deploy. It idles harmlessly until there is work.
4. **web, partner, admin** — deploy. Set `NEXT_PUBLIC_API_URL` *before* the
   first build.
5. **landing** — change its root directory to `apps/landing`. See the note in
   PR #1; do this before merging, or its next build fails (the running deploy
   keeps serving in the meantime).

## Seeding a demo environment

```bash
pnpm demo:reset
```

Run locally against the environment's public `DATABASE_URL`. It refuses any URL
that does not look disposable unless `SPREDDPAY_CONFIRM_RESET=1` is set —
deliberately, because it truncates every table.

Do not run it against an environment holding real partner data.

## Before pointing anything at a live card program

`RAIN_MODE=production` is refused by both the environment schema and the
provider factory, so a production deploy today runs in `mock`. That gate comes
off only after program, compliance, credentials, domains, webhooks and funds
flow are approved — and after `docs/rain-api-map.md` and
`docs/rain-flow-of-funds.md` are actually filled in.
