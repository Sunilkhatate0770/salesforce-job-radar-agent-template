#!/bin/zsh
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="$HOME/Library/Application Support/SalesforceJobRadarAgent"
RUNTIME_DIR="$APP_DIR/runtime"

mkdir -p "$APP_DIR" "$RUNTIME_DIR"

rsync -a --delete \
  --exclude ".git" \
  --exclude ".cache" \
  --exclude ".DS_Store" \
  "$REPO_DIR"/ "$RUNTIME_DIR"/

chmod +x "$RUNTIME_DIR/scripts/run-agent-local.sh" \
  "$RUNTIME_DIR/scripts/install-launchd.sh" \
  "$RUNTIME_DIR/scripts/uninstall-launchd.sh" \
  "$RUNTIME_DIR/scripts/sync-launchd-runtime.sh"

echo "Synced runtime to: $RUNTIME_DIR"
