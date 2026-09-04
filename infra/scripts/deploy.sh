#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/run/leadgen-demo}"
COMPOSE_FILE="${COMPOSE_FILE:-${APP_DIR}/compose.production.yml}"
RUNTIME_ENV_FILE="${RUNTIME_ENV_FILE:-${APP_DIR}/runtime.env}"
SECCOMP_PATH="${SECCOMP_PATH:-${APP_DIR}/seccomp.json}"
DEPLOYED_TAG_FILE="${DEPLOYED_TAG_FILE:-${APP_DIR}/deployed.tag}"
ROLLBACK_TAG_FILE="${ROLLBACK_TAG_FILE:-${APP_DIR}/rollback.tag}"
IMAGE_TAG="${IMAGE_TAG:?IMAGE_TAG is required}"
REGISTRY="${REGISTRY:?REGISTRY is required}"
WEB_IMAGE="${REGISTRY}/web:${IMAGE_TAG}"
WORKER_IMAGE="${REGISTRY}/worker:${IMAGE_TAG}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/api/health/ready}"
SMOKE_URL="${SMOKE_URL:-http://127.0.0.1/api/health/live}"

if [[ ! -f "${RUNTIME_ENV_FILE}" ]]; then
  echo "[deploy] Missing runtime env at ${RUNTIME_ENV_FILE}" >&2
  exit 1
fi

if [[ -f "${DEPLOYED_TAG_FILE}" ]]; then
  cp "${DEPLOYED_TAG_FILE}" "${ROLLBACK_TAG_FILE}"
  echo "[deploy] Saved rollback tag $(cat "${ROLLBACK_TAG_FILE}")"
fi

echo "[deploy] Pulling ${WEB_IMAGE} and ${WORKER_IMAGE}"
docker pull "${WEB_IMAGE}"
docker pull "${WORKER_IMAGE}"

export WEB_IMAGE WORKER_IMAGE RUNTIME_ENV_FILE SECCOMP_PATH
cd "${APP_DIR}"

echo "[deploy] Running migrations"
if command -v pnpm >/dev/null 2>&1 && [[ -d "${APP_DIR}/repo" ]]; then
  (
    cd "${APP_DIR}/repo"
    set -a
    # shellcheck disable=SC1090
    source "${RUNTIME_ENV_FILE}"
    set +a
    pnpm db:migrate
  )
else
  echo "[deploy] Skipping migrations (repo tooling unavailable on VM)"
fi

echo "[deploy] Starting containers"
docker compose -f "${COMPOSE_FILE}" up -d --remove-orphans

echo "[deploy] Waiting for readiness"
for _ in $(seq 1 30); do
  if curl -fsS "${HEALTH_URL}" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

if ! curl -fsS "${HEALTH_URL}" >/dev/null; then
  echo "[deploy] Readiness check failed" >&2
  "${APP_DIR}/rollback.sh" || true
  exit 1
fi

if ! curl -fsS "${SMOKE_URL}" >/dev/null; then
  echo "[deploy] Smoke check failed" >&2
  "${APP_DIR}/rollback.sh" || true
  exit 1
fi

echo "${IMAGE_TAG}" > "${DEPLOYED_TAG_FILE}"
echo "[deploy] Deployed ${IMAGE_TAG}"
