FROM node:24.13.1-alpine AS builder

WORKDIR /app
RUN apk add --no-cache curl
RUN corepack enable && corepack use pnpm@latest

COPY backend/package.json backend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY backend/ ./
RUN pnpm run build

# ─── test stage ──────────────────────────────────────────────────────────────
# Compiles src/ AND test/ (tsconfig.e2e.json excludes nothing but spec files).
# Boots from test/main.test.ts which uses MockLLMService — no real LLM keys needed.
FROM node:24.13.1-alpine AS test

WORKDIR /app
RUN apk add --no-cache curl
RUN corepack enable && corepack use pnpm@latest

COPY backend/ ./
RUN pnpm install --frozen-lockfile
RUN pnpm exec nest build -p tsconfig.e2e.json

EXPOSE 8001
CMD ["node", "dist/test/main.test.js"]

# ─── production runner ────────────────────────────────────────────────────────
FROM node:24.13.1-alpine AS runner

WORKDIR /app
RUN apk add --no-cache curl
RUN corepack enable && corepack use pnpm@latest

COPY backend/package.json backend/pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

COPY --from=builder /app/dist ./dist

EXPOSE 8001
CMD ["node", "dist/src/main.js"]

