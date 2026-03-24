#!/bin/zsh
set -euo pipefail

PLIST_DEST="$HOME/Library/LaunchAgents/com.salesforce-job-radar-agent.plist"
LABEL="com.salesforce-job-radar-agent"
GUI_DOMAIN="gui/$(id -u)"
APP_DIR="$HOME/Library/Application Support/SalesforceJobRadarAgent"

launchctl bootout "$GUI_DOMAIN" "$PLIST_DEST" >/dev/null 2>&1 || true
rm -f "$PLIST_DEST"

echo "Removed launchd agent: $LABEL"
echo "Runtime copy preserved at: $APP_DIR"
