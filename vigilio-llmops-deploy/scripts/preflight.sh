#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="${SCRIPT_DIR}/../compose"
ENV_FILE_PATH="${ENV_FILE:-${COMPOSE_DIR}/.env}"

if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  orchestrator=(docker compose)
elif command -v podman >/dev/null 2>&1 && podman compose version >/dev/null 2>&1; then
  orchestrator=(podman compose)
elif command -v podman-compose >/dev/null 2>&1 && podman-compose --version >/dev/null 2>&1; then
  orchestrator=(podman-compose)
else
  printf 'BLOCKED: Neither docker compose nor podman compose is installed.\n' >&2
  exit 1
fi

if [[ ! -f "${ENV_FILE_PATH}" ]]; then
  printf 'FAIL: Environment file not found at %s\n' "${ENV_FILE_PATH}" >&2
  exit 1
fi

required_secrets=(
  postgres_password
  database_url
  valkey_password
  nats_token
  session_secret
  encryption_key_b64
  facebook_app_secret
  smtp_password
  grafana_password
  metrics_token
  pgbackrest_repo_key
  pgbackrest_s3_secret
)

for secret_name in "${required_secrets[@]}"; do
  secret_file="${COMPOSE_DIR}/secrets/${secret_name}"
  if [[ ! -s "${secret_file}" ]]; then
    printf 'FAIL: Missing or empty secret file: %s\n' "${secret_file}" >&2
    exit 1
  fi
done

# Enforce 0600 permissions on native POSIX filesystems (skip DrvFS /mnt/c mounts)
if [[ ! "${COMPOSE_DIR}" =~ ^/mnt/[a-zA-Z]/ ]] && command -v stat >/dev/null 2>&1; then
  env_mode="$(stat -c '%a' "${ENV_FILE_PATH}" 2>/dev/null || true)"
  if [[ -n "${env_mode}" && "${env_mode}" != "600" ]]; then
    printf 'FAIL: %s must have mode 600, found %s\n' "${ENV_FILE_PATH}" "${env_mode}" >&2
    exit 1
  fi
fi

set -a
# shellcheck disable=SC1090
source "${ENV_FILE_PATH}"
set +a

if [[ "${ALLOW_LOCAL_DEV_TAGS:-no}" != "yes" ]]; then
  "${SCRIPT_DIR}/verify-image-digests.sh"
fi

cd "${COMPOSE_DIR}"
ENV_FILE="${ENV_FILE_PATH}" "${orchestrator[@]}" --env-file "${ENV_FILE_PATH}" -f compose.yaml config --quiet
printf 'PASS: Compose preflight, secret presence, and configuration interpolation verified.\n'
