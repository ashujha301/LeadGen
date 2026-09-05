#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/leadgen}"
APP_CHECKOUT="${APP_CHECKOUT:-${APP_DIR}/app}"
COMPOSE_FILE="${COMPOSE_FILE:-${APP_CHECKOUT}/infra/docker/compose.production.yml}"
RUNTIME_ENV_FILE="${RUNTIME_ENV_FILE:-${APP_DIR}/runtime.env}"
CONFIG_FILE="${CONFIG_FILE:-${APP_DIR}/config.env}"
SECCOMP_SRC="${SECCOMP_SRC:-${APP_CHECKOUT}/infra/docker/seccomp.json}"
SECCOMP_PATH="${SECCOMP_PATH:-${APP_DIR}/seccomp.json}"
ROLLBACK_TAG_FILE="${ROLLBACK_TAG_FILE:-${APP_DIR}/rollback.tag}"
DEPLOYED_TAG_FILE="${DEPLOYED_TAG_FILE:-${APP_DIR}/deployed.tag}"
DOCKERHUB_TOKEN_FILE="${DOCKERHUB_TOKEN_FILE:-${APP_DIR}/.dockerhub-pull-token}"
DOCKERHUB_REPO="${DOCKERHUB_REPO:-ashujha301/leadgen}"
DOCKERHUB_USERNAME="${DOCKERHUB_USERNAME:-ashujha301}"
GCP_PROJECT_ID="${GCP_PROJECT_ID:?GCP_PROJECT_ID is required}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/api/health/ready}"
READY_TIMEOUT_SECS="${READY_TIMEOUT_SECS:-90}"
WORKER_HEALTH_TIMEOUT_SECS="${WORKER_HEALTH_TIMEOUT_SECS:-90}"

logged_into_dockerhub=0

cleanup() {
  if [[ "${logged_into_dockerhub}" -eq 1 ]]; then
    docker logout >/dev/null 2>&1 || true
  fi
  rm -f "${DOCKERHUB_TOKEN_FILE}" 2>/dev/null || true
}
trap cleanup EXIT

if [[ ! -f "${ROLLBACK_TAG_FILE}" ]]; then
  echo "[rollback] No rollback tag found at ${ROLLBACK_TAG_FILE}" >&2
  exit 1
fi

ROLLBACK_TAG="$(tr -d '[:space:]' < "${ROLLBACK_TAG_FILE}")"
if [[ -z "${ROLLBACK_TAG}" ]]; then
  echo "[rollback] Rollback tag file is empty" >&2
  exit 1
fi

WEB_IMAGE="${DOCKERHUB_REPO}:web-${ROLLBACK_TAG}"
WORKER_IMAGE="${DOCKERHUB_REPO}:worker-${ROLLBACK_TAG}"

if [[ ! -f "${RUNTIME_ENV_FILE}" ]]; then
  if [[ ! -f "${CONFIG_FILE}" ]]; then
    echo "[rollback] Missing runtime env and config; cannot load secrets" >&2
    exit 1
  fi
  APP_DIR="${APP_DIR}" \
    GCP_PROJECT_ID="${GCP_PROJECT_ID}" \
    CONFIG_FILE="${CONFIG_FILE}" \
    OUTPUT_FILE="${RUNTIME_ENV_FILE}" \
    DOCKERHUB_TOKEN_FILE="${DOCKERHUB_TOKEN_FILE}" \
    "${APP_CHECKOUT}/infra/scripts/load-secrets.sh"
fi

if [[ ! -f "${DOCKERHUB_TOKEN_FILE}" ]]; then
  # Token is not stored in runtime.env; fetch it alone when needed.
  PROJECT_ID="${GCP_PROJECT_ID}"
  umask 077
  gcloud secrets versions access latest \
    --secret="leadgen-demo-dockerhub-pull-token" \
    --project="${PROJECT_ID}" > "${DOCKERHUB_TOKEN_FILE}"
  chmod 0600 "${DOCKERHUB_TOKEN_FILE}"
  chown root:root "${DOCKERHUB_TOKEN_FILE}" 2>/dev/null || true
fi

if [[ -f "${SECCOMP_SRC}" ]]; then
  install -o root -g root -m 0644 "${SECCOMP_SRC}" "${SECCOMP_PATH}"
fi

echo "[rollback] Authenticating to Docker Hub"
if ! docker login -u "${DOCKERHUB_USERNAME}" --password-stdin < "${DOCKERHUB_TOKEN_FILE}" >/dev/null; then
  echo "[rollback] Docker Hub login failed" >&2
  exit 1
fi
logged_into_dockerhub=1
rm -f "${DOCKERHUB_TOKEN_FILE}"

echo "[rollback] Restoring ${ROLLBACK_TAG}"
docker pull "${WEB_IMAGE}"
docker pull "${WORKER_IMAGE}"

export WEB_IMAGE WORKER_IMAGE RUNTIME_ENV_FILE SECCOMP_PATH
cd "${APP_DIR}"

docker compose -f "${COMPOSE_FILE}" config >/dev/null
docker compose -f "${COMPOSE_FILE}" up -d --remove-orphans web worker

ready=0
for _ in $(seq 1 "$((READY_TIMEOUT_SECS / 2))"); do
  if curl -fsS "${HEALTH_URL}" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 2
done
if [[ "${ready}" -ne 1 ]]; then
  echo "[rollback] Web readiness check failed after restore" >&2
  exit 1
fi

worker_ready=0
for _ in $(seq 1 "$((WORKER_HEALTH_TIMEOUT_SECS / 2))"); do
  if docker inspect --format='{{.State.Health.Status}}' leadgen-worker 2>/dev/null | grep -qx healthy; then
    worker_ready=1
    break
  fi
  sleep 2
done
if [[ "${worker_ready}" -ne 1 ]]; then
  echo "[rollback] Worker health check failed after restore" >&2
  exit 1
fi

printf '%s\n' "${ROLLBACK_TAG}" > "${DEPLOYED_TAG_FILE}"
echo "[rollback] Restored ${ROLLBACK_TAG}"
