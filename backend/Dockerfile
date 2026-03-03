FROM node:24.13.1-alpine AS builder

WORKDIR /app
RUN apk add --no-cache curl
RUN corepack enable && corepack use pnpm@latest

# Copy workspace setup
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./

# Copy backend and packages
COPY backend/package.json ./backend/
COPY packages/db/package.json ./packages/db/

# Copy source
COPY backend/ ./backend/
COPY packages/ ./packages/

# Install dependencies and build
RUN pnpm install --frozen-lockfile
RUN cd backend && pnpm run build
RUN cd packages/db && pnpm run build

# ─── unit-test stage ─────────────────────────────────────────────────────────
# Installs all deps (incl. devDeps) and runs Vitest via SWC.
# No app build needed — vitest transpiles on-the-fly.
FROM node:24.13.1-alpine AS unit-test

WORKDIR /app
RUN apk add --no-cache curl
RUN corepack enable && corepack use pnpm@latest

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY backend/package.json ./backend/
COPY packages/db/package.json ./packages/db/

COPY backend/ ./backend/
COPY packages/ ./packages/

RUN pnpm install --frozen-lockfile
RUN cd packages/db && pnpm run build

WORKDIR /app/backend
CMD ["pnpm", "test"]

# ─── test stage ──────────────────────────────────────────────────────────────
FROM node:24.13.1-alpine AS test

WORKDIR /app
RUN apk add --no-cache curl
RUN corepack enable && corepack use pnpm@latest

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY backend/package.json ./backend/
COPY packages/db/package.json ./packages/db/

COPY backend/ ./backend/
COPY packages/ ./packages/

RUN pnpm install --frozen-lockfile
RUN cd backend && pnpm exec nest build -p tsconfig.e2e.json
RUN cd packages/db && pnpm run build

EXPOSE 8001
WORKDIR /app/backend
CMD ["node", "dist/test/main.test.js"]

# ─── production runner ────────────────────────────────────────────────────────
FROM node:24.13.1-alpine AS runner

WORKDIR /app
RUN apk add --no-cache curl
RUN corepack enable && corepack use pnpm@latest

COPY backend/package.json ./backend/
COPY packages/db/package.json ./packages/db/
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./

RUN pnpm install --prod --frozen-lockfile

COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/packages/db/dist ./packages/db/dist

EXPOSE 8001
WORKDIR /app/backend
CMD ["node", "dist/src/main.js"]
