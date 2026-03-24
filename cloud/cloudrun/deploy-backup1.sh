#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

: "${PROJECT_ID:?Set PROJECT_ID}"
: "${REGION:?Set REGION, for example asia-south1}"

JOB_NAME="${JOB_NAME:-salesforce-job-radar-backup1}"
ENV_FILE="${ENV_FILE:-$SCRIPT_DIR/env.backup1.yaml}"
CPU="${CPU:-1}"
MEMORY="${MEMORY:-1Gi}"
TASK_TIMEOUT="${TASK_TIMEOUT:-1800s}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi

cd "$REPO_ROOT"

gcloud run jobs deploy "$JOB_NAME" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --source "$REPO_ROOT" \
  --command node \
  --args src/tools/fallbackScheduler.js \
  --tasks 1 \
  --max-retries 0 \
  --cpu "$CPU" \
  --memory "$MEMORY" \
  --task-timeout "$TASK_TIMEOUT" \
  --env-vars-file "$ENV_FILE"

cat <<EOF
Cloud Run backup job deployed.

Next:
1. Create Secret Manager secrets for runtime secrets.
2. Attach them with:
   gcloud run jobs update $JOB_NAME --project $PROJECT_ID --region $REGION --set-secrets KEY=SECRET_NAME:latest
3. Create the Cloud Scheduler trigger using cloud/cloudrun/create-scheduler-backup1.sh
EOF
