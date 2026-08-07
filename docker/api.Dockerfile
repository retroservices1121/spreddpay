# SpreddPay API
#
# Deliberately a single stage. pnpm's isolated node_modules layout spreads
# symlinks across the workspace and a per-package node_modules in every app, so
# copying a dependency stage between images is fragile. Correctness first; the
# image is larger than a hand-tuned multi-stage build and that is an accepted
# trade for a Milestone 1 deployment.
#
# Railway sets RAILWAY_DOCKERFILE_PATH=docker/api.Dockerfile on the service.

FROM node:22-alpine

# libc6-compat: Prisma's query engine is glibc-linked and needs the shim on Alpine.
RUN apk add --no-cache libc6-compat \
  && corepack enable \
  && corepack prepare pnpm@9.15.9 --activate

WORKDIR /app

COPY . .

# --prod=false because the build needs devDependencies (tsup, typescript). If
# Railway passes NODE_ENV=production as a build arg, omitting this would drop
# them and the build would fail on a missing compiler.
RUN pnpm install --frozen-lockfile --prod=false

# `prisma generate` reads the datasource block, so it needs *a* DATABASE_URL
# even though it never connects. This placeholder exists only for the duration
# of this layer; the real one is injected by Railway at runtime.
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" \
    pnpm --filter @spreddpay/db exec prisma generate

RUN pnpm --filter @spreddpay/api build

ENV NODE_ENV=production

# No EXPOSE and no hardcoded port: the server reads $PORT, which Railway injects.
CMD ["pnpm", "--filter", "@spreddpay/api", "start"]
