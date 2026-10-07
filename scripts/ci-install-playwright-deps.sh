#!/usr/bin/env bash
# Install Playwright's Chromium system dependencies (apt) in CI, giving each
# attempt a time limit and retrying once. The runner's Ubuntu mirror sometimes
# slows to a crawl mid-download; the retry resumes apt's partial downloads.
set -uo pipefail

ATTEMPT_TIMEOUT="${ATTEMPT_TIMEOUT:-4m}"

cd "$(dirname "$0")/../frontend" || exit 1

# `timeout` only signals Playwright's own process. The apt-get it started
# through sudo runs as root, survives, and keeps holding the dpkg lock, so the
# retry would fail at once with "Could not get lock".
release_apt_locks() {
  sudo pkill -TERM -x apt-get || true
  for _ in $(seq 30); do
    pgrep -x apt-get >/dev/null || pgrep -x dpkg >/dev/null || break
    sleep 2
  done
  sudo pkill -KILL -x apt-get || true
  # Finish any package dpkg was interrupted in the middle of.
  sudo dpkg --configure -a || true
}

for attempt in 1 2; do
  if timeout --kill-after=30s "$ATTEMPT_TIMEOUT" ./node_modules/.bin/playwright install-deps chromium; then
    exit 0
  fi
  echo "::warning::playwright install-deps attempt $attempt failed or timed out"
  release_apt_locks
done
exit 1
