FROM node:24.13.1-alpine AS builder

WORKDIR /app
RUN apk add --no-cache curl
RUN corepack enable && corepack use pnpm@latest

COPY packages/db/package.json packages/db/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY packages/db/ ./
RUN pnpm build

FROM node:24.13.1-alpine AS runner

WORKDIR /app
RUN apk add --no-cache curl
RUN corepack enable && corepack use pnpm@latest

COPY packages/db/package.json packages/db/pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/drizzle ./drizzle

CMD ["pnpm", "db:migrate:runtime"]