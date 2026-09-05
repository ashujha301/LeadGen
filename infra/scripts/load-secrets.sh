#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/leadgen}"
PROJECT_ID="${GCP_PROJECT_ID:?GCP_PROJECT_ID is required}"
CONFIG_FILE="${CONFIG_FILE:-${APP_DIR}/config.env}"
OUTPUT_FILE="${OUTPUT_FILE:-${APP_DIR}/runtime.env}"
DOCKERHUB_TOKEN_FILE="${DOCKERHUB_TOKEN_FILE:-${APP_DIR}/.dockerhub-pull-token}"

# High-value credentials must come from Secret Manager (6-slot budget).
# AUTH_SECRET and IP_HASH_SALT are allowed in config.env to stay within that limit.
FORBIDDEN_CONFIG_KEYS=(
  DATABASE_URL
  OPENAI_API_KEY
  CRUSTDATA_API_KEY
  EMAIL_VERIFIER_API_KEY
  GOOGLE_CLIENT_ID
  GOOGLE_CLIENT_SECRET
  DOCKERHUB_PULL_TOKEN
  DOCKERHUB_PASSWORD
  DOCKERHUB_TOKEN
)

if [[ ! -f "${CONFIG_FILE}" ]]; then
  echo "[load-secrets] Missing config file at ${CONFIG_FILE}" >&2
  exit 1
fi

while IFS= read -r line || [[ -n "${line}" ]]; do
  [[ -z "${line}" || "${line}" =~ ^[[:space:]]*# ]] && continue
  key="${line%%=*}"
  key="${key%"${key##*[![:space:]]}"}"
  key="${key#"${key%%[![:space:]]*}"}"
  for forbidden in "${FORBIDDEN_CONFIG_KEYS[@]}"; do
    if [[ "${key}" == "${forbidden}" ]]; then
      echo "[load-secrets] Rejected: ${CONFIG_FILE} must not contain secret key ${key}" >&2
      exit 1
    fi
  done
done < "${CONFIG_FILE}"

read_secret() {
  local secret_id="$1"
  gcloud secrets versions access latest \
    --secret="${secret_id}" \
    --project="${PROJECT_ID}"
}

# shellcheck disable=SC1090
set -a
source "${CONFIG_FILE}"
set +a

ENABLE_EMAIL_VERIFIER="${ENABLE_EMAIL_VERIFIER:-false}"

if [[ -z "${AUTH_SECRET:-}" || -z "${IP_HASH_SALT:-}" ]]; then
  echo "[load-secrets] ${CONFIG_FILE} must set AUTH_SECRET and IP_HASH_SALT" >&2
  exit 1
fi

DATABASE_URL="$(read_secret leadgen-demo-database-url)"
OPENAI_API_KEY="$(read_secret leadgen-demo-openai-api-key)"
CRUSTDATA_API_KEY="$(read_secret leadgen-demo-crustdata-api-key)"

if [[ -z "${DATABASE_URL}" || -z "${OPENAI_API_KEY}" || -z "${CRUSTDATA_API_KEY}" ]]; then
  echo "[load-secrets] Required secrets are missing (DATABASE_URL, OPENAI_API_KEY, CRUSTDATA_API_KEY)" >&2
  exit 1
fi

EMAIL_VERIFIER_API_KEY=""
if EMAIL_VERIFIER_API_KEY="$(read_secret leadgen-demo-email-verifier-api-key 2>/dev/null)"; then
  :
elif [[ "${ENABLE_EMAIL_VERIFIER}" == "true" ]]; then
  echo "[load-secrets] EMAIL_VERIFIER_API_KEY is required when ENABLE_EMAIL_VERIFIER=true" >&2
  exit 1
else
  echo "[load-secrets] Email verifier secret unavailable; continuing with ENABLE_EMAIL_VERIFIER=false" >&2
  EMAIL_VERIFIER_API_KEY=""
fi

DOCKERHUB_PULL_TOKEN="$(read_secret leadgen-demo-dockerhub-pull-token)"
if [[ -z "${DOCKERHUB_PULL_TOKEN}" ]]; then
  echo "[load-secrets] Missing Docker Hub pull token secret" >&2
  exit 1
fi

GOOGLE_CLIENT_ID="$(read_secret leadgen-demo-google-client-id)"
GOOGLE_CLIENT_SECRET="$(read_secret leadgen-demo-google-client-secret)"
if [[ -z "${GOOGLE_CLIENT_ID}" || -z "${GOOGLE_CLIENT_SECRET}" ]]; then
  echo "[load-secrets] Missing Google OAuth secrets (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET)" >&2
  exit 1
fi

TMP_FILE="$(mktemp "${APP_DIR}/.runtime.env.XXXXXX")"
cleanup() {
  rm -f "${TMP_FILE}"
}
trap cleanup EXIT

{
  # Preserve config.env first (includes AUTH_SECRET + IP_HASH_SALT).
  grep -vE '^[[:space:]]*(#|$)' "${CONFIG_FILE}" || true

  printf 'DATABASE_URL=%s\n' "${DATABASE_URL}"
  printf 'OPENAI_API_KEY=%s\n' "${OPENAI_API_KEY}"
  printf 'CRUSTDATA_API_KEY=%s\n' "${CRUSTDATA_API_KEY}"
  printf 'GOOGLE_CLIENT_ID=%s\n' "${GOOGLE_CLIENT_ID}"
  printf 'GOOGLE_CLIENT_SECRET=%s\n' "${GOOGLE_CLIENT_SECRET}"
  if [[ -n "${EMAIL_VERIFIER_API_KEY}" ]]; then
    printf 'EMAIL_VERIFIER_API_KEY=%s\n' "${EMAIL_VERIFIER_API_KEY}"
  fi
} > "${TMP_FILE}"

install -o root -g root -m 0600 "${TMP_FILE}" "${OUTPUT_FILE}"

umask 077
printf '%s' "${DOCKERHUB_PULL_TOKEN}" > "${DOCKERHUB_TOKEN_FILE}"
chmod 0600 "${DOCKERHUB_TOKEN_FILE}"
chown root:root "${DOCKERHUB_TOKEN_FILE}" 2>/dev/null || true

# Avoid leaving secret material in the shell environment of callers that source this script.
unset DATABASE_URL OPENAI_API_KEY CRUSTDATA_API_KEY EMAIL_VERIFIER_API_KEY IP_HASH_SALT AUTH_SECRET GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET DOCKERHUB_PULL_TOKEN

echo "[load-secrets] Wrote ${OUTPUT_FILE} (secrets not logged)"
echo "[load-secrets] Docker Hub pull token stored at ${DOCKERHUB_TOKEN_FILE}"
