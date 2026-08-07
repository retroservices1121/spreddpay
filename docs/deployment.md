# Deployment (Railway)

## One project, six services

A Railway **service** runs one process on one port. SpreddPay is six processes,
so it is six services — all inside a **single Railway project**, sharing one
Postgres. They cannot be combined into one service.

Keeping them in the same project is what lets them reach Postgres over Railway's
private network (`postgres.railway.internal`) instead of the public proxy.

| Service | Build | Public domain |
| --- | --- | --- |
| **landing** *(exists)* | Nixpacks, root directory `apps/landing` | `spreddpay.com` |
| **api** | `RAILWAY_DOCKERFILE_PATH=docker/api.Dockerfile` | `api.spreddpay.com` |
| **web** (trader) | `RAILWAY_DOCKERFILE_PATH=docker/web.Dockerfile` | `app.spreddpay.com` |
| **partner** | `RAILWAY_DOCKERFILE_PATH=docker/partner.Dockerfile` | `partner.spreddpay.com` |
| **admin** | `RAILWAY_DOCKERFILE_PATH=docker/admin.Dockerfile` | `admin.spreddpay.com` |
| **worker** | `RAILWAY_DOCKERFILE_PATH=docker/worker.Dockerfile` | none |
| **Postgres** | — | — |

Notes on the table:

- **The five platform services are configured entirely by variables.** Root
  directory stays at the repo default and there are no build or start commands
  to set in the dashboard — `RAILWAY_DOCKERFILE_PATH` is an ordinary service
  variable, so the whole setup is reproducible and lives in git.
- **Root directory must stay `/` for those five.** pnpm workspace resolution
  needs `pnpm-lock.yaml` and `pnpm-workspace.yaml` at the build context root.
  Setting a subdirectory breaks the install.
- **landing is the exception.** Root directory `apps/landing`, Nixpacks, zero
  dependencies, no Dockerfile. Deliberate: spreddpay.com cannot be taken down by
  a platform build failure.
- **The worker needs no domain.** It has no HTTP surface.

### Why single-stage Dockerfiles

pnpm's isolated `node_modules` layout spreads symlinks across the workspace root
and every package. Copying a dependency stage between images is fragile in that
layout, so each Dockerfile installs, generates the Prisma client and builds in
one stage. The images are larger than a hand-tuned multi-stage build; that is an
accepted trade for a first deployment. `.dockerignore` keeps the build context
small.

`prisma generate` needs *a* `DATABASE_URL` to parse the datasource block even
though it never connects, so the build layer supplies a placeholder. The real
one is injected by Railway at runtime.

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

### Additionally on each service

```env
RAILWAY_DOCKERFILE_PATH=docker/<service>.Dockerfile
```

### Additionally on web, partner and admin

```env
NEXT_PUBLIC_API_URL=https://api.spreddpay.com
```

**This is read at build time**, not at runtime — Next.js inlines `NEXT_PUBLIC_*`
into the bundle. The Dockerfiles declare it as an `ARG` so Railway's build args
reach the compiler. Changing it needs a **rebuild**, not a restart.

### Optionally on api and worker

```env
REDIS_URL=${{Redis.REDIS_URL}}
```

Without it the worker runs its jobs on in-process intervals, which is fine for
beta. Add a Redis service when you want BullMQ.

`NODE_ENV=production` also makes session cookies `secure`, so every portal must
be served over HTTPS. Railway domains are HTTPS by default.

## Live deployment (project `spreddpay`, environment `production`)

| Service | URL |
| --- | --- |
| landing | https://spreddpay.com |
| api | https://api-production-8abf.up.railway.app |
| web (trader) | https://web-production-a60d3.up.railway.app |
| partner | https://partner-production-8879.up.railway.app |
| admin | https://admin-production-6bc6.up.railway.app |
| worker | no domain |

These are Railway-generated hostnames, which is why `SESSION_COOKIE_SAMESITE`
is set to `none` on the API — see below. Moving to `spreddpay.com` subdomains
should be accompanied by setting it back to `lax`.

## Cookies across subdomains

The session cookie is host-only on the API's domain, `SameSite=Lax`, `httpOnly`.
A request from `app.spreddpay.com` to `api.spreddpay.com` is **same-site** —
same registrable domain — so `Lax` permits it and `credentials: "include"`
works. No cookie `domain` attribute is needed.

This breaks if the API is served from a different registrable domain.
Railway's generated hostnames are exactly that case: `up.railway.app` is on the
Public Suffix List, so `api-production-8abf` and `web-production-a60d3` are
different *sites* and a `Lax` cookie is never sent — login appears to succeed
and then every subsequent request is unauthenticated.

`SESSION_COOKIE_SAMESITE` selects the policy:

| Hosting | Value |
| --- | --- |
| `api.spreddpay.com` + `app.spreddpay.com` | `lax` (default, preferred) |
| Railway-generated `*.up.railway.app` | `none` |

`none` forces `Secure`, so the env schema refuses it outside production. With
`none`, cross-site request forgery is held off by the CORS allow-list plus the
JSON content type forcing a preflight — weaker than `lax`, which is why custom
domains on `spreddpay.com` remain the better end state.

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
