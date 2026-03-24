#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/Sunilkhatate0770/salesforce-job-radar-agent.git}"
BRANCH="${BRANCH:-main}"
APP_DIR="${APP_DIR:-$HOME/salesforce-job-radar-agent}"
NODE_MAJOR="${NODE_MAJOR:-20}"

if command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update
  sudo apt-get install -y curl git ca-certificates
  if ! command -v node >/dev/null 2>&1; then
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | sudo -E bash -
    sudo apt-get install -y nodejs
  fi
fi

if [[ ! -d "$APP_DIR/.git" ]]; then
  git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
else
  git -C "$APP_DIR" fetch origin
  git -C "$APP_DIR" checkout "$BRANCH"
  git -C "$APP_DIR" pull --ff-only origin "$BRANCH"
fi

cd "$APP_DIR"
npm ci

cat <<EOF
OCI backup bootstrap completed.

Next:
1. Copy cloud/oci/backup2.env.example to cloud/oci/backup2.env and fill secrets.
2. Run:
   bash cloud/oci/install-backup2-cron.sh
3. Verify with:
   crontab -l
EOF
