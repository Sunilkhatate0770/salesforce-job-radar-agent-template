#!/bin/zsh
set -euo pipefail

: "${GITHUB_TOKEN:?Set GITHUB_TOKEN first}"

REPO="${GITHUB_REPO:-Sunilkhatate0770/salesforce-job-radar-agent}"
WORKFLOW_FILE="${GITHUB_WORKFLOW_FILE:-salesforce-job-radar-agent.yml}"
REF="${GITHUB_REF_NAME:-main}"

curl -L \
  -X POST \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer ${GITHUB_TOKEN}" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  -H "Content-Type: application/json" \
  "https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches" \
  -d "{\"ref\":\"${REF}\",\"inputs\":{\"dispatch_source\":\"external-scheduler\",\"force_run\":\"false\"}}"

echo
echo "Workflow dispatch sent for ${REPO}@${REF}"
