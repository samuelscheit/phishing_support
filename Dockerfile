# syntax=docker/dockerfile:1

# Multi-stage build for Next.js (Bun)

FROM oven/bun:1.3.5-debian AS deps
WORKDIR /app

# System deps needed for some native modules during install (kept in build stage)
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile


FROM oven/bun:1.3.5-debian AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Ensure Next builds in production mode
ENV NODE_ENV=production
RUN bun run build


FROM oven/bun:1.3.5-debian AS runner
WORKDIR /app

# Runtime deps: Chromium for puppeteer-real-browser + libzmq for zeromq
RUN apt-get update \
  && apt-get install -y --no-install-recommends chromium libzmq5 ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=3000

# Default path for Chromium in Debian-based images
ENV CHROME_PATH=/usr/bin/chromium
ENV PUPPETEER_HEADLESS=true
ENV DOCKER=true

COPY --from=builder /app/package.json ./
COPY --from=builder /app/bun.lock ./
COPY --from=builder /app/next.config.ts ./
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/drizzle ./drizzle

EXPOSE 3000

CMD ["bun", "run", "start"]
