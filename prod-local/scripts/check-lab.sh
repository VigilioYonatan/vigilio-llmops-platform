#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LAB_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DEPLOY_ROOT="$(cd "${LAB_ROOT}/../vigilio-llmops-deploy" && pwd)"
COMPOSE_FILE="${DEPLOY_ROOT}/compose/compose.yaml"

# 1. Anti-fork check: prod-local MUST NOT contain its own Compose or Caddyfile
forked_files="$(find "${LAB_ROOT}" -maxdepth 3 \( -iname '*compose*.yml' -o -iname '*compose*.yaml' -o -name 'Caddyfile' \) 2>/dev/null || true)"
if [[ -n "${forked_files}" ]]; then
  printf 'FAIL: Topology fork detected inside prod-local (must reuse vigilio-llmops-deploy):\n%s\n' "${forked_files}" >&2
  exit 1
fi

if [[ ! -f "${COMPOSE_FILE}" ]]; then
  printf 'FAIL: Canonical compose file not found at %s\n' "${COMPOSE_FILE}" >&2
  exit 1
fi

# 2. Structural check via python3 (verifying 5 networks & caddy isolation)
python3 - "${COMPOSE_FILE}" <<'PY'
import sys, yaml

with open(sys.argv[1], "r", encoding="utf-8") as fh:
    doc = yaml.safe_load(fh)

networks = set((doc.get("networks") or {}).keys())
expected = {"edge", "reverse_proxy", "backend", "observability", "egress"}
missing = expected - networks
if missing:
    sys.stderr.write(f"FAIL: Missing required networks in canonical compose.yaml: {sorted(missing)}\n")
    sys.exit(1)

caddy_nets = doc["services"]["caddy"].get("networks") or []
if "backend" in caddy_nets:
    sys.stderr.write("FAIL: caddy is attached to internal backend network!\n")
    sys.exit(1)

print("PASS: Canonical vigilio-llmops-deploy/compose/compose.yaml topology invariants verified.")
PY

# 3. Compose config interpolation dry-run in isolated temp dir
if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  orchestrator=(docker compose)
elif command -v podman >/dev/null 2>&1 && podman compose version >/dev/null 2>&1; then
  orchestrator=(podman compose)
elif command -v podman-compose >/dev/null 2>&1 && podman-compose --version >/dev/null 2>&1; then
  orchestrator=(podman-compose)
else
  printf 'NOT_RUN: No Docker/Podman Compose CLI detected for live interpolation check.\n'
  exit 0
fi

TMP_DIR="$(mktemp -d)"
cleanup() { rm -rf "${TMP_DIR}"; }
trap cleanup EXIT

cp -r "${DEPLOY_ROOT}/compose" "${TMP_DIR}/compose"
cp -r "${DEPLOY_ROOT}/edge" "${TMP_DIR}/edge"
cp -r "${DEPLOY_ROOT}/observability" "${TMP_DIR}/observability"
cp "${DEPLOY_ROOT}/compose/.env.example" "${TMP_DIR}/compose/.env"

for secret_name in \
  postgres_password database_url valkey_password nats_token session_secret \
  encryption_key_b64 facebook_app_secret smtp_password grafana_password \
  metrics_token pgbackrest_repo_key pgbackrest_s3_secret; do
  printf 'lab-ephemeral-secret-check\n' > "${TMP_DIR}/compose/secrets/${secret_name}"
done

(
  cd "${TMP_DIR}/compose"
  ENV_FILE="${TMP_DIR}/compose/.env" "${orchestrator[@]}" --env-file "${TMP_DIR}/compose/.env" -f compose.yaml config >/dev/null
)
printf 'PASS: prod-local check-lab verified canonical Compose interpolation cleanly.\n'
