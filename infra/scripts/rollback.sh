#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/run/leadgen-demo}"
COMPOSE_FILE="${COMPOSE_FILE:-${APP_DIR}/compose.production.yml}"
RUNTIME_ENV_FILE="${RUNTIME_ENV_FILE:-${APP_DIR}/runtime.env}"
SECCOMP_PATH="${SECCOMP_PATH:-${APP_DIR}/seccomp.json}"
ROLLBACK_TAG_FILE="${ROLLBACK_TAG_FILE:-${APP_DIR}/rollback.tag}"
DEPLOYED_TAG_FILE="${DEPLOYED_TAG_FILE:-${APP_DIR}/deployed.tag}"
REGISTRY="${REGISTRY:?REGISTRY is required}"

if [[ ! -f "${ROLLBACK_TAG_FILE}" ]]; then
  echo "[rollback] No rollback tag found at ${ROLLBACK_TAG_FILE}" >&2
  exit 1
fi

ROLLBACK_TAG="$(cat "${ROLLBACK_TAG_FILE}")"
WEB_IMAGE="${REGISTRY}/web:${ROLLBACK_TAG}"
WORKER_IMAGE="${REGISTRY}/worker:${ROLLBACK_TAG}"

echo "[rollback] Restoring ${ROLLBACK_TAG}"
docker pull "${WEB_IMAGE}" || true
docker pull "${WORKER_IMAGE}" || true

export WEB_IMAGE WORKER_IMAGE RUNTIME_ENV_FILE SECCOMP_PATH
cd "${APP_DIR}"
docker compose -f "${COMPOSE_FILE}" up -d --remove-orphans

echo "${ROLLBACK_TAG}" > "${DEPLOYED_TAG_FILE}"
echo "[rollback] Restored ${ROLLBACK_TAG}"
