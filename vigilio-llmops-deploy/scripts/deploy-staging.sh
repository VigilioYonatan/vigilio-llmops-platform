#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_DIR="${DEPLOY_ROOT}/compose"
ENV_FILE_PATH="${ENV_FILE:-${COMPOSE_DIR}/.env}"
PREVIOUS_ENV_PATH="${COMPOSE_DIR}/.env.previous"
DEPLOY_ENVIRONMENT="${DEPLOY_ENVIRONMENT:-staging}"
HEALTH_TIMEOUT_SECONDS="${DEPLOY_HEALTH_TIMEOUT_SECONDS:-90}"

if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  orchestrator=(docker compose)
elif command -v podman >/dev/null 2>&1 && podman compose version >/dev/null 2>&1; then
  orchestrator=(podman compose)
elif command -v podman-compose >/dev/null 2>&1 && podman-compose --version >/dev/null 2>&1; then
  orchestrator=(podman-compose)
else
  printf 'BLOCKED: No Docker Compose or Podman Compose runtime available.\n' >&2
  exit 1
fi

if ! command -v cosign >/dev/null 2>&1; then
  printf 'BLOCKED: cosign is required on the host before pulling or migrating images.\n' >&2
  exit 1
fi

ALLOW_LOCAL_DEV_TAGS="no" ENV_FILE="${ENV_FILE_PATH}" "${SCRIPT_DIR}/preflight.sh"

set -a
# shellcheck disable=SC1090
source "${ENV_FILE_PATH}"
set +a

verify_supply_chain_image() {
  local image_ref="$1"
  printf 'Verifying Cosign signature for %s ...\n' "${image_ref}"
  if [[ -n "${COSIGN_PUBLIC_KEY_PATH:-}" ]]; then
    cosign verify --key "${COSIGN_PUBLIC_KEY_PATH}" "${image_ref}" >/dev/null
  else
    : "${COSIGN_CERTIFICATE_OIDC_ISSUER:?COSIGN_CERTIFICATE_OIDC_ISSUER required for keyless Cosign verification}"
    : "${COSIGN_CERTIFICATE_IDENTITY_REGEXP:?COSIGN_CERTIFICATE_IDENTITY_REGEXP required for keyless Cosign verification}"
    cosign verify \
      --certificate-oidc-issuer "${COSIGN_CERTIFICATE_OIDC_ISSUER}" \
      --certificate-identity-regexp "${COSIGN_CERTIFICATE_IDENTITY_REGEXP}" \
      "${image_ref}" >/dev/null
  fi

  if [[ "${COSIGN_REQUIRE_ATTESTATION:-true}" == "true" ]]; then
    printf 'Verifying SLSA v1.2 provenance attestation for %s ...\n' "${image_ref}"
    if [[ -n "${COSIGN_PUBLIC_KEY_PATH:-}" ]]; then
      cosign verify-attestation --type slsaprovenance --key "${COSIGN_PUBLIC_KEY_PATH}" "${image_ref}" >/dev/null
    else
      cosign verify-attestation \
        --type slsaprovenance \
        --certificate-oidc-issuer "${COSIGN_CERTIFICATE_OIDC_ISSUER}" \
        --certificate-identity-regexp "${COSIGN_CERTIFICATE_IDENTITY_REGEXP}" \
        "${image_ref}" >/dev/null
    fi
  fi
}

# Gate 1: Host-side cryptographic verification BEFORE pulling or running schema migrations
verify_supply_chain_image "${BACKEND_IMAGE}"
verify_supply_chain_image "${WEB_IMAGE}"

rollback_active=0
rollback_to_previous() {
  local exit_code=$?
  if [[ "${rollback_active}" -eq 1 && -f "${PREVIOUS_ENV_PATH}" ]]; then
    printf 'ERROR: Deployment failed (exit=%d). Rolling back to pinned digests in %s ...\n' "${exit_code}" "${PREVIOUS_ENV_PATH}" >&2
    cp -f "${PREVIOUS_ENV_PATH}" "${ENV_FILE_PATH}"
    chmod 600 "${ENV_FILE_PATH}" 2>/dev/null || true
    (
      cd "${COMPOSE_DIR}"
      ENV_FILE="${ENV_FILE_PATH}" "${orchestrator[@]}" --env-file "${ENV_FILE_PATH}" -f compose.yaml up -d --remove-orphans api worker outbox web caddy
    ) || true
    printf 'Rollback applied using previous signed digests. Inspect logs and runbooks/rollback.md.\n' >&2
  fi
  exit "${exit_code}"
}
trap rollback_to_previous ERR

if [[ -f "${ENV_FILE_PATH}" ]]; then
  cp -f "${ENV_FILE_PATH}" "${PREVIOUS_ENV_PATH}"
  chmod 600 "${PREVIOUS_ENV_PATH}" 2>/dev/null || true
fi

cd "${COMPOSE_DIR}"
rollback_active=1

printf 'Pulling digest-pinned images...\n'
ENV_FILE="${ENV_FILE_PATH}" "${orchestrator[@]}" --env-file "${ENV_FILE_PATH}" -f compose.yaml pull

printf 'Starting stateful backing services (postgres, valkey, nats)...\n'
ENV_FILE="${ENV_FILE_PATH}" "${orchestrator[@]}" --env-file "${ENV_FILE_PATH}" -f compose.yaml up -d postgres valkey nats

printf 'Executing isolated expand/contract database migrations BEFORE rolling application services...\n'
ENV_FILE="${ENV_FILE_PATH}" "${orchestrator[@]}" --env-file "${ENV_FILE_PATH}" -f compose.yaml --profile tools run --rm migration

printf 'Executing isolated JetStream & platform setup...\n'
ENV_FILE="${ENV_FILE_PATH}" "${orchestrator[@]}" --env-file "${ENV_FILE_PATH}" -f compose.yaml --profile tools run --rm platform-setup

printf 'Rolling stateless application, edge, and observability services...\n'
ENV_FILE="${ENV_FILE_PATH}" "${orchestrator[@]}" --env-file "${ENV_FILE_PATH}" -f compose.yaml up -d --remove-orphans

printf 'Waiting up to %ds for health readiness gate (%s/health/ready)...\n' "${HEALTH_TIMEOUT_SECONDS}" "${SITE_ORIGIN%/}"
deadline=$((SECONDS + HEALTH_TIMEOUT_SECONDS))
ready=0
while (( SECONDS < deadline )); do
  if curl --fail --silent --max-time 5 "${SITE_ORIGIN%/}/health/ready" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 3
done

if [[ "${ready}" -ne 1 ]]; then
  printf 'FAIL: Health readiness gate timed out after %ds.\n' "${HEALTH_TIMEOUT_SECONDS}" >&2
  exit 1
fi

SITE_ORIGIN="${SITE_ORIGIN}" "${SCRIPT_DIR}/smoke.sh"
rollback_active=0
trap - ERR

ENV_FILE="${ENV_FILE_PATH}" "${SCRIPT_DIR}/vigilio-services-check.sh" --environment "${DEPLOY_ENVIRONMENT}"
printf 'PASS: %s deployment completed and operational evidence recorded.\n' "${DEPLOY_ENVIRONMENT}"
