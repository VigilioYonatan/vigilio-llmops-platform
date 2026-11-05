#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LAB_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DEPLOY_ROOT="$(cd "${LAB_ROOT}/../vigilio-llmops-deploy" && pwd)"

export SITE_ORIGIN="${SITE_ORIGIN:-https://localhost}"
EVIDENCE_OUT="${LAB_ROOT}/reports/prod-local-evidence.json"
mkdir -p "${LAB_ROOT}/reports"

"${SCRIPT_DIR}/check-lab.sh"
"${DEPLOY_ROOT}/scripts/smoke.sh"

headers="$(curl --silent --head --max-time 10 "${SITE_ORIGIN%/}/" || true)"
if ! printf '%s' "${headers}" | grep -qi 'content-security-policy:'; then
  printf 'FAIL: Missing Content-Security-Policy header on SPA root response.\n' >&2
  exit 1
fi

"${DEPLOY_ROOT}/scripts/vigilio-services-check.sh" --environment prod-local --output "${EVIDENCE_OUT}"
printf 'PASS: prod-local smoke and security header verification succeeded (%s).\n' "${EVIDENCE_OUT}"
