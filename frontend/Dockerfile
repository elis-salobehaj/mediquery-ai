# Frontend Dockerfile - Multi-stage build
# Supports 'test' (Playwright) and 'production' (Nginx) targets

# ==========================================
# Target: test (Component Tests)
# ==========================================
FROM mcr.microsoft.com/playwright:v1.58.2-noble AS test
WORKDIR /app

# Install pnpm via corepack (respects version in package.json)
RUN corepack enable && corepack use pnpm@latest

# Install dependencies (Cached Layer)
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copy source code (Frequent changes layer)
COPY . .

# Default command
CMD ["pnpm", "exec", "playwright", "test"]

# ==========================================
# Shared Builder Stage (for Production)
# ==========================================
FROM node:24.13.1-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack use pnpm@latest

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build the app
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN pnpm run build

# Stage 2: Production
FROM nginx:alpine AS production

# Copy built assets
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
