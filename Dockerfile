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

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates wget gnupg

RUN set -euxo pipefail; \
  wget -qO- https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/google-linux-signing-keyring.gpg; \
  echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-linux-signing-keyring.gpg] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list; \
  apt-get update; \
  apt-get install -y --no-install-recommends ca-certificates xvfb xauth fonts-liberation libasound2 libnss3 libxss1 libgtk-3-0 google-chrome-stable; \
  rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV DOCKER=true
ENV CHROME_PATH=/usr/bin/google-chrome-stable

# Start Xvfb explicitly and then run Next.
RUN set -eux; \
  cat > /usr/local/bin/start-with-xvfb.sh <<'SH'
#!/bin/sh
set -e

export DISPLAY="${DISPLAY:-:99}"

Xvfb "$DISPLAY" -screen 0 1280x1024x24 -nolisten tcp &
XVFB_PID=$!

cleanup() {
  kill "$XVFB_PID" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

exec bunx --bun next start -H 0.0.0.0 -p "${PORT:-3000}"
SH

RUN chmod +x /usr/local/bin/start-with-xvfb.sh

COPY --from=builder /app/package.json ./
COPY --from=builder /app/bun.lock ./
COPY --from=builder /app/next.config.ts ./
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/drizzle ./drizzle

EXPOSE 3000

CMD ["/usr/local/bin/start-with-xvfb.sh"]
