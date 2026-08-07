# SpreddPay funded trading firm portal.
#
# Same single-stage rationale as docker/api.Dockerfile.
# Railway sets RAILWAY_DOCKERFILE_PATH=docker/partner.Dockerfile on the service.

FROM node:22-alpine

RUN apk add --no-cache libc6-compat \
  && corepack enable \
  && corepack prepare pnpm@9.15.9 --activate

WORKDIR /app

# NEXT_PUBLIC_* is inlined into the client bundle at build time, not read at
# runtime. Railway supplies service variables as build args, so this has to be
# declared here or the browser would call http://localhost:4000 in production.
# Changing it later requires a rebuild, not just a restart.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

COPY . .

RUN pnpm install --frozen-lockfile --prod=false

# The partner app imports @spreddpay/contracts, which does not need Prisma — but the
# workspace typecheck path does, and generating here keeps every image's build
# identical and debuggable.
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" \
    pnpm --filter @spreddpay/db exec prisma generate

RUN pnpm --filter @spreddpay/partner-portal build

ENV NODE_ENV=production

# `next start` with no --port reads $PORT, which Railway injects.
CMD ["pnpm", "--filter", "@spreddpay/partner-portal", "start"]
