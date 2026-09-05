#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/leadgen}"
APP_CHECKOUT="${APP_CHECKOUT:-${APP_DIR}/app}"
COMPOSE_FILE="${COMPOSE_FILE:-${APP_CHECKOUT}/infra/docker/compose.production.yml}"
RUNTIME_ENV_FILE="${RUNTIME_ENV_FILE:-${APP_DIR}/runtime.env}"
CONFIG_FILE="${CONFIG_FILE:-${APP_DIR}/config.env}"
SECCOMP_SRC="${SECCOMP_SRC:-${APP_CHECKOUT}/infra/docker/seccomp.json}"
SECCOMP_PATH="${SECCOMP_PATH:-${APP_DIR}/seccomp.json}"
DEPLOYED_TAG_FILE="${DEPLOYED_TAG_FILE:-${APP_DIR}/deployed.tag}"
ROLLBACK_TAG_FILE="${ROLLBACK_TAG_FILE:-${APP_DIR}/rollback.tag}"
LOCK_FILE="${LOCK_FILE:-${APP_DIR}/.deploy.lock}"
DOCKERHUB_TOKEN_FILE="${DOCKERHUB_TOKEN_FILE:-${APP_DIR}/.dockerhub-pull-token}"
DOCKERHUB_REPO="${DOCKERHUB_REPO:-ashujha301/leadgen}"
DOCKERHUB_USERNAME="${DOCKERHUB_USERNAME:-ashujha301}"
IMAGE_TAG="${IMAGE_TAG:?IMAGE_TAG is required}"
GCP_PROJECT_ID="${GCP_PROJECT_ID:?GCP_PROJECT_ID is required}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/api/health/ready}"
LIVE_URL="${LIVE_URL:-http://127.0.0.1:3000/api/health/live}"
NGINX_SMOKE_URL="${NGINX_SMOKE_URL:-http://127.0.0.1/api/health/live}"
READY_TIMEOUT_SECS="${READY_TIMEOUT_SECS:-90}"
WORKER_HEALTH_TIMEOUT_SECS="${WORKER_HEALTH_TIMEOUT_SECS:-90}"

WEB_IMAGE="${DOCKERHUB_REPO}:web-${IMAGE_TAG}"
WORKER_IMAGE="${DOCKERHUB_REPO}:worker-${IMAGE_TAG}"

logged_into_dockerhub=0
rollback_attempted=0

cleanup() {
  if [[ "${logged_into_dockerhub}" -eq 1 ]]; then
    docker logout >/dev/null 2>&1 || true
  fi
  rm -f "${DOCKERHUB_TOKEN_FILE}" 2>/dev/null || true
  if [[ -n "${LOCK_FD:-}" ]]; then
    flock -u "${LOCK_FD}" 2>/dev/null || true
  fi
}
trap cleanup EXIT

fail_and_rollback() {
  local message="$1"
  echo "[deploy] ${message}" >&2
  if [[ "${rollback_attempted}" -eq 0 && -f "${ROLLBACK_TAG_FILE}" ]]; then
    rollback_attempted=1
    echo "[deploy] Invoking rollback" >&2
    APP_DIR="${APP_DIR}" \
      GCP_PROJECT_ID="${GCP_PROJECT_ID}" \
      DOCKERHUB_REPO="${DOCKERHUB_REPO}" \
      DOCKERHUB_USERNAME="${DOCKERHUB_USERNAME}" \
      "${APP_CHECKOUT}/infra/scripts/rollback.sh" || true
  fi
  exit 1
}

# 1. Acquire deployment lock
mkdir -p "${APP_DIR}"
exec {LOCK_FD}>"${LOCK_FILE}"
if ! flock -n "${LOCK_FD}"; then
  echo "[deploy] Another deployment holds ${LOCK_FILE}" >&2
  exit 1
fi

# 2. Validate required inputs and host files
if [[ ! -f "${COMPOSE_FILE}" ]]; then
  echo "[deploy] Missing compose file at ${COMPOSE_FILE}" >&2
  exit 1
fi
if [[ ! -f "${CONFIG_FILE}" ]]; then
  echo "[deploy] Missing config file at ${CONFIG_FILE}" >&2
  exit 1
fi
if [[ ! -f "${SECCOMP_SRC}" ]]; then
  echo "[deploy] Missing seccomp profile at ${SECCOMP_SRC}" >&2
  exit 1
fi
if [[ ! -x "${APP_CHECKOUT}/infra/scripts/load-secrets.sh" ]]; then
  echo "[deploy] Missing load-secrets.sh" >&2
  exit 1
fi

install -o root -g root -m 0644 "${SECCOMP_SRC}" "${SECCOMP_PATH}"

# Preserve previous tag for rollback before replacing images.
if [[ -f "${DEPLOYED_TAG_FILE}" ]]; then
  cp "${DEPLOYED_TAG_FILE}" "${ROLLBACK_TAG_FILE}"
  echo "[deploy] Saved rollback tag $(tr -d '\n' < "${ROLLBACK_TAG_FILE}")"
fi

# 3. Load non-secret configuration and GCP secrets
# 4. Retrieve Docker Hub read-only token without logging it
APP_DIR="${APP_DIR}" \
  GCP_PROJECT_ID="${GCP_PROJECT_ID}" \
  CONFIG_FILE="${CONFIG_FILE}" \
  OUTPUT_FILE="${RUNTIME_ENV_FILE}" \
  DOCKERHUB_TOKEN_FILE="${DOCKERHUB_TOKEN_FILE}" \
  "${APP_CHECKOUT}/infra/scripts/load-secrets.sh"

if [[ ! -f "${RUNTIME_ENV_FILE}" || ! -f "${DOCKERHUB_TOKEN_FILE}" ]]; then
  echo "[deploy] Secrets load did not produce required files" >&2
  exit 1
fi

# 5. Log into Docker Hub through stdin
echo "[deploy] Authenticating to Docker Hub"
if ! docker login -u "${DOCKERHUB_USERNAME}" --password-stdin < "${DOCKERHUB_TOKEN_FILE}" >/dev/null; then
  echo "[deploy] Docker Hub login failed" >&2
  exit 1
fi
logged_into_dockerhub=1
rm -f "${DOCKERHUB_TOKEN_FILE}"

# 6. Pull immutable web and worker commit-SHA tags
echo "[deploy] Pulling ${WEB_IMAGE} and ${WORKER_IMAGE}"
docker pull "${WEB_IMAGE}"
docker pull "${WORKER_IMAGE}"

export WEB_IMAGE WORKER_IMAGE RUNTIME_ENV_FILE SECCOMP_PATH
cd "${APP_DIR}"

# 7. Validate the rendered Docker Compose configuration
echo "[deploy] Validating compose configuration"
docker compose -f "${COMPOSE_FILE}" config >/dev/null

# 8. Run migrations and stop immediately if they fail
echo "[deploy] Running migrations"
if ! docker compose -f "${COMPOSE_FILE}" --profile migrate run --rm migrate; then
  fail_and_rollback "Migration failed; aborting deployment"
fi

# 9. Start or update web and worker containers
echo "[deploy] Starting containers"
docker compose -f "${COMPOSE_FILE}" up -d --remove-orphans web worker

# 10. Wait for web readiness and worker health
echo "[deploy] Waiting for web readiness"
ready=0
for _ in $(seq 1 "$((READY_TIMEOUT_SECS / 2))"); do
  if curl -fsS "${HEALTH_URL}" >/dev/null 2>&1 && curl -fsS "${LIVE_URL}" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 2
done
if [[ "${ready}" -ne 1 ]]; then
  fail_and_rollback "Web readiness check failed"
fi

echo "[deploy] Waiting for worker health"
worker_ready=0
for _ in $(seq 1 "$((WORKER_HEALTH_TIMEOUT_SECS / 2))"); do
  if docker inspect --format='{{.State.Health.Status}}' leadgen-worker 2>/dev/null | grep -qx healthy; then
    worker_ready=1
    break
  fi
  sleep 2
done
if [[ "${worker_ready}" -ne 1 ]]; then
  fail_and_rollback "Worker health check failed"
fi

# 11. Verify the Nginx proxy
echo "[deploy] Verifying Nginx proxy"
if ! curl -fsS -H "Host: demoleadgen.duckdns.org" "${NGINX_SMOKE_URL}" >/dev/null; then
  fail_and_rollback "Nginx smoke check failed"
fi

# 12. Save the current and rollback tags
printf '%s\n' "${IMAGE_TAG}" > "${DEPLOYED_TAG_FILE}"
echo "[deploy] Deployed ${IMAGE_TAG}"

# 14. Log out from Docker Hub without printing credentials (via EXIT trap)
echo "[deploy] Deployment complete"
