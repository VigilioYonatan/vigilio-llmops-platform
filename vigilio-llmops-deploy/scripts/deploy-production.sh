#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_DIR="${DEPLOY_ROOT}/compose"
ENV_FILE_PATH="${ENV_FILE:-${COMPOSE_DIR}/.env}"

if [[ ! -f "${ENV_FILE_PATH}" ]]; then
  printf 'FAIL: Production environment file missing at %s\n' "${ENV_FILE_PATH}" >&2
  exit 1
fi

: "${PROMOTED_FROM_STAGING_SHA:?PROMOTED_FROM_STAGING_SHA (40-char git commit SHA validated in staging) is required}"
: "${CHANGE_APPROVAL_REF:?CHANGE_APPROVAL_REF (approved change/release ticket ID) is required}"

if [[ ! "${PROMOTED_FROM_STAGING_SHA}" =~ ^[0-9a-f]{40}$ ]]; then
  printf 'FAIL: PROMOTED_FROM_STAGING_SHA must be a 40-character lowercase hex commit SHA.\n' >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "${ENV_FILE_PATH}"
set +a

if [[ "${APP_NODE_ENV:-}" != "production" ]]; then
  printf 'FAIL: APP_NODE_ENV must be "production" for production deployment.\n' >&2
  exit 1
fi

if [[ "${SESSION_COOKIE_SECURE:-}" != "true" ]]; then
  printf 'FAIL: SESSION_COOKIE_SECURE must be "true" (__Host- cookies enforced) in production.\n' >&2
  exit 1
fi

if [[ "${COMPOSE_PROFILES:-}" == *"devtools"* ]]; then
  printf 'FAIL: devtools profile (mailpit) is strictly prohibited in production.\n' >&2
  exit 1
fi

if [[ "${PGBACKREST_REPO1_S3_ENDPOINT:-}" == "" || "${PGBACKREST_REPO1_S3_ENDPOINT}" == *"example.internal"* ]]; then
  printf 'FAIL: Offsite S3 pgBackRest endpoint must be configured to a real independent target in production.\n' >&2
  exit 1
fi

export DEPLOY_ENVIRONMENT="production"
export ENV_FILE="${ENV_FILE_PATH}"
exec "${SCRIPT_DIR}/deploy-staging.sh"
