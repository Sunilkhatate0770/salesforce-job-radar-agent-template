#!/bin/zsh
set -euo pipefail

PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="${AGENT_APP_DIR:-$SCRIPT_DIR}"
RUNTIME_DIR="${AGENT_RUNTIME_DIR:-$APP_DIR/runtime}"

NODE_BIN="$(command -v node || true)"
if [[ -z "$NODE_BIN" ]]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] node not found in PATH=$PATH" >> "$APP_DIR/launchd.stderr.log"
  exit 1
fi

mkdir -p "$APP_DIR"
LOCK_DIR="$APP_DIR/local-scheduler.lock"
RUN_LOG="$APP_DIR/local-scheduler.log"

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] skip: previous run still active" >> "$RUN_LOG"
  exit 0
fi

cleanup() {
  rmdir "$LOCK_DIR" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

cd "$RUNTIME_DIR"
export NOTIFY_EVERY_RUN="${NOTIFY_EVERY_RUN:-true}"
export AGENT_RUN_SOURCE="launchd"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] start local scheduled run" >> "$RUN_LOG"
"$NODE_BIN" src/run.js >> "$RUN_LOG" 2>&1
echo "[$(date '+%Y-%m-%d %H:%M:%S')] end local scheduled run" >> "$RUN_LOG"
