#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/run/leadgen-demo}"
PROJECT_ID="${GCP_PROJECT_ID:?GCP_PROJECT_ID is required}"
OUTPUT_FILE="${OUTPUT_FILE:-${APP_DIR}/runtime.env}"
TMP_FILE="$(mktemp)"

declare -A SECRET_MAP=(
  [DATABASE_URL]="leadgen-demo-database-url"
  [OPENAI_API_KEY]="leadgen-demo-openai-api-key"
  [CRUSTDATA_API_KEY]="leadgen-demo-crustdata-api-key"
  [EMAIL_VERIFIER_API_KEY]="leadgen-demo-email-verifier-api-key"
  [IP_HASH_SALT]="leadgen-demo-ip-hash-salt"
)

mkdir -p "$(dirname "${OUTPUT_FILE}")"
: > "${TMP_FILE}"

for env_key in "${!SECRET_MAP[@]}"; do
  secret_id="${SECRET_MAP[${env_key}]}"
  if ! value="$(gcloud secrets versions access latest \
    --secret="${secret_id}" \
    --project="${PROJECT_ID}" 2>/dev/null)"; then
    echo "[load-secrets] Skipping missing secret ${secret_id}" >&2
    continue
  fi
  printf '%s=%q\n' "${env_key}" "${value}" >> "${TMP_FILE}"
done

cat >> "${TMP_FILE}" <<EOF
NODE_ENV=production
APP_URL=${APP_URL:-http://127.0.0.1}
PORT=3000
OPENAI_MODEL=${OPENAI_MODEL:-gpt-5.4-mini}
OPENAI_MAX_OUTPUT_TOKENS=${OPENAI_MAX_OUTPUT_TOKENS:-2000}
OPENAI_TIMEOUT_MS=${OPENAI_TIMEOUT_MS:-45000}
ENABLE_CRUSTDATA=${ENABLE_CRUSTDATA:-false}
ENABLE_EMAIL_VERIFIER=${ENABLE_EMAIL_VERIFIER:-false}
CRAWL_MAX_PAGES=${CRAWL_MAX_PAGES:-10}
CRAWL_MAX_DEPTH=${CRAWL_MAX_DEPTH:-2}
CRAWL_CONCURRENCY=${CRAWL_CONCURRENCY:-1}
CRAWL_TIMEOUT_MS=${CRAWL_TIMEOUT_MS:-90000}
RAW_DATA_RETENTION_DAYS=${RAW_DATA_RETENTION_DAYS:-7}
PUBLIC_RUN_LIMIT_PER_IP_DAY=${PUBLIC_RUN_LIMIT_PER_IP_DAY:-3}
PUBLIC_GLOBAL_RUN_LIMIT_DAY=${PUBLIC_GLOBAL_RUN_LIMIT_DAY:-50}
PUBLIC_ACTIVE_RUNS_PER_IP=${PUBLIC_ACTIVE_RUNS_PER_IP:-1}
LOG_LEVEL=${LOG_LEVEL:-info}
TRUSTED_PROXY_HOPS=${TRUSTED_PROXY_HOPS:-1}
PLAYWRIGHT_HEADLESS=true
WORKER_CONCURRENCY=1
EOF

install -m 600 "${TMP_FILE}" "${OUTPUT_FILE}"
rm -f "${TMP_FILE}"
echo "[load-secrets] Wrote ${OUTPUT_FILE}"
