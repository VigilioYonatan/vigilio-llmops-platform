#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
DEPLOY_ROOT="${WORKSPACE_ROOT}/vigilio-llmops-deploy"

: "${ALLOW_TEST_DATA_RESET:?Set ALLOW_TEST_DATA_RESET=yes only for isolated lab resources}"
if [[ "${ALLOW_TEST_DATA_RESET}" != "yes" ]]; then
  printf 'FAIL: Lab reset not authorized.\n' >&2
  exit 1
fi

"${SCRIPT_DIR}/check-lab.sh"

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

ALLOW_LOCAL_DEV_TAGS="yes" "${DEPLOY_ROOT}/scripts/preflight.sh"

cd "${DEPLOY_ROOT}/compose"
"${orchestrator[@]}" --env-file .env -f compose.yaml up -d postgres nats valkey
"${orchestrator[@]}" --env-file .env -f compose.yaml --profile tools run --rm migration
"${orchestrator[@]}" --env-file .env -f compose.yaml --profile tools run --rm platform-setup
"${orchestrator[@]}" --env-file .env -f compose.yaml --profile devtools up -d
printf 'PASS: Isolated prod-local lab started from canonical vigilio-llmops-deploy/compose/compose.yaml.\n'
