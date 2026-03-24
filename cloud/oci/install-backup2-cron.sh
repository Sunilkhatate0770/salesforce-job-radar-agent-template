#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN_SCRIPT="${RUN_SCRIPT:-$SCRIPT_DIR/run-backup2.sh}"
CRON_SCHEDULE="${CRON_SCHEDULE:-*/10 * * * *}"
LOG_PATH="${LOG_PATH:-$SCRIPT_DIR/backup2.log}"

if [[ ! -f "$RUN_SCRIPT" ]]; then
  echo "Missing run script: $RUN_SCRIPT" >&2
  exit 1
fi

chmod +x "$RUN_SCRIPT"

CURRENT_CRONTAB="$(mktemp)"
trap 'rm -f "$CURRENT_CRONTAB"' EXIT

crontab -l > "$CURRENT_CRONTAB" 2>/dev/null || true
grep -vF "$RUN_SCRIPT" "$CURRENT_CRONTAB" > "${CURRENT_CRONTAB}.next" || true
printf "%s %s >> %s 2>&1\n" "$CRON_SCHEDULE" "$RUN_SCRIPT" "$LOG_PATH" >> "${CURRENT_CRONTAB}.next"
crontab "${CURRENT_CRONTAB}.next"

echo "OCI backup cron installed with schedule '$CRON_SCHEDULE'"
