#!/usr/bin/env bash
set -euo pipefail

: "${SITE_ORIGIN:?SITE_ORIGIN required (e.g. https://llmops.example.internal)}"
BASE_URL="${SITE_ORIGIN%/}"

curl --fail --silent --show-error --max-time 10 "${BASE_URL}/health/live" >/dev/null
curl --fail --silent --show-error --max-time 10 "${BASE_URL}/health/ready" >/dev/null

metrics_code="$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 10 "${BASE_URL}/metrics" || true)"
if [[ "${metrics_code}" != "401" && "${metrics_code}" != "403" ]]; then
  printf 'FAIL: External /metrics must return 401 or 403, got HTTP %s\n' "${metrics_code}" >&2
  exit 1
fi

docs_code="$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 10 "${BASE_URL}/api/docs" || true)"
if [[ "${docs_code}" != "403" && "${docs_code}" != "404" ]]; then
  printf 'FAIL: External /api/docs must return 403 or 404, got HTTP %s\n' "${docs_code}" >&2
  exit 1
fi

printf 'PASS: Smoke gates succeeded (/health/live=200, /health/ready=200, /metrics=%s, /api/docs=%s).\n' "${metrics_code}" "${docs_code}"
