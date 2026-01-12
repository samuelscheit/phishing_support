#!/usr/bin/env bash
set -euo pipefail

term_handler() {
  if [[ -n "${next_pid:-}" ]] && kill -0 "$next_pid" 2>/dev/null; then
    kill -TERM "$next_pid" 2>/dev/null || true
  fi
  if [[ -n "${imap_pid:-}" ]] && kill -0 "$imap_pid" 2>/dev/null; then
    kill -TERM "$imap_pid" 2>/dev/null || true
  fi
  wait || true
}

trap term_handler SIGTERM SIGINT

# Run IMAP worker
bun run imap &
imap_pid=$!

# Run Next.js server (needs Xvfb for Chrome-based tooling)
xvfb-run -a --server-args='-screen 0 1280x1024x24 -nolisten tcp' bunx --bun next start -H 0.0.0.0 -p 3000 &
next_pid=$!

# If either process exits, stop the other and exit with the same status.
set +e
wait -n "$imap_pid" "$next_pid"
status=$?
set -e

term_handler
exit "$status"
