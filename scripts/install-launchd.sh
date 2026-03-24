#!/bin/zsh
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TEMPLATE_PATH="$REPO_DIR/launchd/com.salesforce-job-radar-agent.plist.template"
PLIST_DEST="$HOME/Library/LaunchAgents/com.salesforce-job-radar-agent.plist"
LABEL="com.salesforce-job-radar-agent"
GUI_DOMAIN="gui/$(id -u)"
APP_DIR="$HOME/Library/Application Support/SalesforceJobRadarAgent"
RUNTIME_DIR="$APP_DIR/runtime"
RUNNER_PATH="$APP_DIR/run-agent-local.sh"
STDOUT_PATH="$APP_DIR/launchd.stdout.log"
STDERR_PATH="$APP_DIR/launchd.stderr.log"

mkdir -p "$HOME/Library/LaunchAgents" "$APP_DIR"
zsh "$REPO_DIR/scripts/sync-launchd-runtime.sh"
cp "$REPO_DIR/scripts/run-agent-local.sh" "$RUNNER_PATH"
chmod +x "$RUNNER_PATH"

sed \
  -e "s#__RUNNER_PATH__#$RUNNER_PATH#g" \
  -e "s#__WORKING_DIR__#$RUNTIME_DIR#g" \
  -e "s#__STDOUT_PATH__#$STDOUT_PATH#g" \
  -e "s#__STDERR_PATH__#$STDERR_PATH#g" \
  "$TEMPLATE_PATH" > "$PLIST_DEST"
chmod 644 "$PLIST_DEST"

launchctl bootout "$GUI_DOMAIN" "$PLIST_DEST" >/dev/null 2>&1 || true
launchctl bootstrap "$GUI_DOMAIN" "$PLIST_DEST"
launchctl enable "$GUI_DOMAIN/$LABEL"
launchctl kickstart -k "$GUI_DOMAIN/$LABEL"

echo "Installed launchd agent: $LABEL"
echo "Plist: $PLIST_DEST"
echo "Runtime: $RUNTIME_DIR"
echo "Status command: launchctl print $GUI_DOMAIN/$LABEL"
