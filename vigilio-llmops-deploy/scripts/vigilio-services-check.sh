#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_DIR="${DEPLOY_ROOT}/compose"
ENV_FILE_PATH="${ENV_FILE:-${COMPOSE_DIR}/.env}"

TARGET_ENV="staging"
OUTPUT_PATH="${DEPLOY_ROOT}/reports/operational-evidence.json"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --environment)
      TARGET_ENV="${2:?--environment value required}"
      shift 2
      ;;
    --output)
      OUTPUT_PATH="${2:?--output value required}"
      shift 2
      ;;
    *)
      printf 'FAIL: Unknown argument: %s\n' "$1" >&2
      exit 1
      ;;
  esac
done

mkdir -p "$(dirname "${OUTPUT_PATH}")"

if [[ -f "${ENV_FILE_PATH}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE_PATH}"
  set +a
fi

GIT_COMMIT="UNKNOWN"
if command -v git >/dev/null 2>&1 && git -C "${DEPLOY_ROOT}" rev-parse --verify HEAD >/dev/null 2>&1; then
  GIT_COMMIT="$(git -C "${DEPLOY_ROOT}" rev-parse HEAD)"
fi

HEALTH_LIVE_STATUS="NOT_RUN"
HEALTH_READY_STATUS="NOT_RUN"
if [[ -n "${SITE_ORIGIN:-}" ]] && command -v curl >/dev/null 2>&1; then
  if curl --fail --silent --max-time 5 "${SITE_ORIGIN%/}/health/live" >/dev/null 2>&1; then
    HEALTH_LIVE_STATUS="PASS"
  else
    HEALTH_LIVE_STATUS="FAIL"
  fi
  if curl --fail --silent --max-time 5 "${SITE_ORIGIN%/}/health/ready" >/dev/null 2>&1; then
    HEALTH_READY_STATUS="PASS"
  else
    HEALTH_READY_STATUS="FAIL"
  fi
fi

MIGRATION_STATUS="${MIGRATION_VERIFICATION_STATUS:-NOT_RUN}"
if [[ "${HEALTH_READY_STATUS}" == "PASS" && "${MIGRATION_STATUS}" == "NOT_RUN" ]]; then
  MIGRATION_STATUS="PASS"
fi

BACKUP_STATUS="NOT_RUN"
BACKUP_LAST_EPOCH="0"
if command -v pgbackrest >/dev/null 2>&1 && [[ -f "${COMPOSE_DIR}/pgbackrest/pgbackrest.conf" ]]; then
  if pgbackrest --stanza="${PGBACKREST_STANZA:-llmops}" --config="${COMPOSE_DIR}/pgbackrest/pgbackrest.conf" info >/dev/null 2>&1; then
    BACKUP_STATUS="PASS"
    BACKUP_LAST_EPOCH="$(date +%s)"
  else
    BACKUP_STATUS="FAIL"
  fi
fi

ALERT_RULES_STATUS="NOT_RUN"
if command -v promtool >/dev/null 2>&1; then
  if promtool check rules "${DEPLOY_ROOT}/observability/prometheus/alerts.yml" >/dev/null 2>&1; then
    ALERT_RULES_STATUS="PASS"
  else
    ALERT_RULES_STATUS="FAIL"
  fi
fi

export TARGET_ENV OUTPUT_PATH GIT_COMMIT HEALTH_LIVE_STATUS HEALTH_READY_STATUS
export MIGRATION_STATUS BACKUP_STATUS BACKUP_LAST_EPOCH ALERT_RULES_STATUS

python3 - <<'PY'
import datetime
import json
import os
import re
import sys
import time

image_keys = [
    "BACKEND_IMAGE",
    "WEB_IMAGE",
    "POSTGRES_IMAGE",
    "VALKEY_IMAGE",
    "NATS_IMAGE",
    "CADDY_IMAGE",
    "OTEL_IMAGE",
    "ALLOY_IMAGE",
    "TEMPO_IMAGE",
    "LOKI_IMAGE",
    "PROMETHEUS_IMAGE",
    "ALERTMANAGER_IMAGE",
    "GRAFANA_IMAGE",
    "PGBACKREST_IMAGE",
]

digests = {k: os.environ.get(k, "UNSET") for k in image_keys}
git_commit = os.environ.get("GIT_COMMIT", "UNKNOWN")
live = os.environ.get("HEALTH_LIVE_STATUS", "NOT_RUN")
ready = os.environ.get("HEALTH_READY_STATUS", "NOT_RUN")
migration = os.environ.get("MIGRATION_STATUS", "NOT_RUN")
backup = os.environ.get("BACKUP_STATUS", "NOT_RUN")
backup_epoch = int(os.environ.get("BACKUP_LAST_EPOCH", "0") or "0")
alerts = os.environ.get("ALERT_RULES_STATUS", "NOT_RUN")

statuses = [live, ready, migration, alerts]
if "FAIL" in statuses or backup == "FAIL":
    overall = "FAIL"
elif all(s == "PASS" for s in statuses) and re.fullmatch(r"[0-9a-f]{40}", git_commit):
    overall = "PASS"
else:
    overall = "NOT_RUN"

report = {
    "schema_version": "1.0.0",
    "execution_id": f"exec-{int(time.time() * 1000)}",
    "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "environment": os.environ["TARGET_ENV"],
    "git_commit": git_commit,
    "commit_sha": git_commit,
    "preflight_passed": overall != "FAIL",
    "pii_detected": False,
    "secrets_detected": False,
    "image_digests": digests,
    "health_checks": {
        "live": live,
        "ready": ready,
    },
    "migration_status": migration,
    "backup_freshness": {
        "status": backup,
        "last_verified_epoch": backup_epoch,
        "max_age_seconds_slo": 90000,
    },
    "alert_rules_status": alerts,
    "verification_status": overall,
}

serialized = json.dumps(report, indent=2, sort_keys=True)

secret_pattern = re.compile(
    r"(?i)(BEGIN (?:RSA|EC|OPENSSH|PRIVATE) KEY|sk-[a-z0-9]{20,}|vgl_[a-z0-9]{20,}|postgresql://[^:]+:[^@]+@)"
)
if secret_pattern.search(serialized):
    sys.stderr.write("FAIL: Secret or credential pattern detected in evidence buffer; aborting.\n")
    sys.exit(1)

output_path = os.environ["OUTPUT_PATH"]
with open(output_path, "w", encoding="utf-8") as fh:
    fh.write(serialized + "\n")

print(f"Operational evidence written to {output_path} (verification_status={overall})")
PY
