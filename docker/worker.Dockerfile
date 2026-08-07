# SpreddPay worker — jobs, reconciliation, webhook processing.
#
# Same single-stage rationale as docker/api.Dockerfile.
# Railway sets RAILWAY_DOCKERFILE_PATH=docker/worker.Dockerfile on the service.

FROM node:22-alpine

RUN apk add --no-cache libc6-compat \
  && corepack enable \
  && corepack prepare pnpm@9.15.9 --activate

WORKDIR /app

COPY . .

RUN pnpm install --frozen-lockfile --prod=false

RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" \
    pnpm --filter @spreddpay/db exec prisma generate

RUN pnpm --filter @spreddpay/worker build

ENV NODE_ENV=production

# The worker has no HTTP surface, so this service needs no domain and no port.
CMD ["pnpm", "--filter", "@spreddpay/worker", "start"]
