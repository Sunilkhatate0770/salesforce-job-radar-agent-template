#!/usr/bin/env bash
set -euo pipefail

: "${PROJECT_ID:?Set PROJECT_ID}"
: "${REGION:?Set REGION, for example asia-south1}"

JOB_NAME="${JOB_NAME:-salesforce-job-radar-backup1}"
SCHEDULER_NAME="${SCHEDULER_NAME:-salesforce-job-radar-backup1-schedule}"
SCHEDULER_REGION="${SCHEDULER_REGION:-$REGION}"
SCHEDULE="${SCHEDULE:-*/10 * * * *}"
PROJECT_NUMBER="${PROJECT_NUMBER:-$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)' 2>/dev/null)}"
SERVICE_ACCOUNT_EMAIL="${SERVICE_ACCOUNT_EMAIL:-${PROJECT_NUMBER}-compute@developer.gserviceaccount.com}"

if [[ -z "$PROJECT_NUMBER" ]]; then
  echo "Unable to resolve PROJECT_NUMBER for project $PROJECT_ID" >&2
  exit 1
fi

RUN_URI="https://run.googleapis.com/v2/projects/${PROJECT_ID}/locations/${REGION}/jobs/${JOB_NAME}:run"

if gcloud scheduler jobs describe "$SCHEDULER_NAME" \
  --project "$PROJECT_ID" \
  --location "$SCHEDULER_REGION" >/dev/null 2>&1; then
  gcloud scheduler jobs update http "$SCHEDULER_NAME" \
    --project "$PROJECT_ID" \
    --location "$SCHEDULER_REGION" \
    --schedule "$SCHEDULE" \
    --uri "$RUN_URI" \
    --http-method POST \
    --oauth-service-account-email "$SERVICE_ACCOUNT_EMAIL"
else
  gcloud scheduler jobs create http "$SCHEDULER_NAME" \
    --project "$PROJECT_ID" \
    --location "$SCHEDULER_REGION" \
    --schedule "$SCHEDULE" \
    --uri "$RUN_URI" \
    --http-method POST \
    --oauth-service-account-email "$SERVICE_ACCOUNT_EMAIL"
fi

echo "Cloud Scheduler job ready: $SCHEDULER_NAME"
