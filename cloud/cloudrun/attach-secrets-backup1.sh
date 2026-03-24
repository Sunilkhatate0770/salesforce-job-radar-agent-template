#!/usr/bin/env bash
set -euo pipefail

: "${PROJECT_ID:?Set PROJECT_ID}"
: "${REGION:?Set REGION, for example asia-south1}"

JOB_NAME="${JOB_NAME:-salesforce-job-radar-backup1}"

REQUIRED_SECRETS=(
  "GITHUB_TOKEN=github-token"
  "TELEGRAM_BOT_TOKEN=telegram-bot-token"
  "TELEGRAM_CHAT_ID=telegram-chat-id"
  "SUPABASE_URL=supabase-url"
  "SUPABASE_SERVICE_KEY=supabase-service-key"
  "SMTP_USER=smtp-user"
  "SMTP_PASS=smtp-pass"
  "EMAIL_FROM=email-from"
  "EMAIL_TO=email-to"
)

OPTIONAL_SECRETS=(
  "RESEND_API_KEY=resend-api-key"
  "RESEND_FROM=resend-from"
  "RESEND_REPLY_TO=resend-reply-to"
  "ADZUNA_APP_ID=adzuna-app-id"
  "ADZUNA_APP_KEY=adzuna-app-key"
  "RESUME_SKILLS=resume-skills"
  "RESUME_EXPERIENCE_YEARS=resume-experience-years"
  "RESUME_TARGET_ROLE=resume-target-role"
  "RESUME_TEXT=resume-text"
  "OPENAI_API_KEY=openai-api-key"
)

SECRET_ARGS=""
for mapping in "${REQUIRED_SECRETS[@]}"; do
  if [[ -n "$SECRET_ARGS" ]]; then
    SECRET_ARGS+="," 
  fi
  SECRET_ARGS+="${mapping}:latest"
done

for mapping in "${OPTIONAL_SECRETS[@]}"; do
  secret_name="${mapping#*=}"
  if gcloud secrets describe "$secret_name" \
    --project "$PROJECT_ID" >/dev/null 2>&1; then
    if [[ -n "$SECRET_ARGS" ]]; then
      SECRET_ARGS+=","
    fi
    SECRET_ARGS+="${mapping}:latest"
  else
    echo "Skipping optional secret: $secret_name"
  fi
done

gcloud run jobs update "$JOB_NAME" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --set-secrets "$SECRET_ARGS"

echo "Cloud Run secrets attached for $JOB_NAME"
