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

# Runtime deps:
# - Xvfb (+ xauth) to run a real (headful) browser in containers
# - Google Chrome (preferred for less detection) when available; fallback to Chromium on non-amd64
# - libzmq for zeromq
RUN set -eux; \
  apt-get update; \
  apt-get install -y --no-install-recommends \
    ca-certificates \
    wget \
    gnupg \
    xvfb \
    xauth \
    libzmq5 \
    fonts-liberation \
    libasound2 \
    libnss3 \
    libxss1 \
    libgtk-3-0; \
  arch="$(dpkg --print-architecture)"; \
  if [ "$arch" = "amd64" ]; then \
    wget -qO- https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor > /usr/share/keyrings/google-linux-signing-keyring.gpg; \
    echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-linux-signing-keyring.gpg] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list; \
    apt-get update; \
    apt-get install -y --no-install-recommends google-chrome-stable; \
  else \
    apt-get install -y --no-install-recommends chromium; \
  fi; \
  rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=3000

# Default path for Chromium in Debian-based images
ENV CHROME_PATH=/usr/bin/google-chrome
ENV PUPPETEER_HEADLESS=false
ENV DOCKER=true

COPY --from=builder /app/package.json ./
COPY --from=builder /app/bun.lock ./
COPY --from=builder /app/next.config.ts ./
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/drizzle ./drizzle

EXPOSE 3000

CMD ["xvfb-run", "-a", "bun", "run", "start"]
