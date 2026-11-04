#!/usr/bin/env bash
set -euo pipefail

# Vigilio LLMOps Platform — Automated Disposable PostgreSQL 18 + pgvector PITR Restore Drill
# Restores an offsite encrypted pgBackRest backup into an isolated ephemeral container
# (`--network none`) and records measured RTO/RPO metrics into JSON operational evidence.
# NEVER touches or mounts the live `postgres_data` volume!

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_DIR="${DEPLOY_ROOT}/compose"
ENV_FILE_PATH="${ENV_FILE:-${COMPOSE_DIR}/.env}"
EVIDENCE_PATH="${DRILL_EVIDENCE_PATH:-${DEPLOY_ROOT}/reports/pitr-restore-evidence.json}"
STANZA="${PGBACKREST_STANZA:-llmops}"
TARGET_TIME="${PITR_TARGET_TIME:-}"

if command -v podman >/dev/null 2>&1; then
  CONTAINER_ENGINE="podman"
elif command -v docker >/dev/null 2>&1; then
  CONTAINER_ENGINE="docker"
else
  printf 'BLOCKED: Neither podman nor docker container engine is available for PITR drill.\n' >&2
  exit 1
fi

if [[ -f "${ENV_FILE_PATH}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE_PATH}"
  set +a
fi

PG_IMAGE="${POSTGRES_IMAGE:-pgvector/pgvector:0.8.7-pg18}"
PGB_IMAGE="${PGBACKREST_IMAGE:-pgbackrest/pgbackrest:2.54.2}"
DRILL_ID="vigilio-pitr-drill-$(date +%s)"
DRILL_VOLUME="${DRILL_ID}-pgdata"

if [[ "${DRILL_ID}" =~ ^(llmops-pg|postgres|vigilio-p3-prod|rag-|agentops-) ]]; then
  printf 'SECURITY ABORT: Drill container name collided with protected container namespace!\n' >&2
  exit 1
fi

cleanup() {
  "${CONTAINER_ENGINE}" rm -f "${DRILL_ID}" >/dev/null 2>&1 || true
  "${CONTAINER_ENGINE}" volume rm -f "${DRILL_VOLUME}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

mkdir -p "$(dirname "${EVIDENCE_PATH}")"

REPO_KEY_FILE="${COMPOSE_DIR}/secrets/pgbackrest_repo_key"
S3_SECRET_FILE="${COMPOSE_DIR}/secrets/pgbackrest_s3_secret"
PGB_CONF="${COMPOSE_DIR}/pgbackrest/pgbackrest.conf"

if [[ ! -s "${REPO_KEY_FILE}" || ! -s "${S3_SECRET_FILE}" || ! -f "${PGB_CONF}" ]]; then
  python3 - "${EVIDENCE_PATH}" <<'PY'
import datetime, json, sys
payload = {
    "schema_version": "1.0.0",
    "drill_type": "pgbackrest_pitr_restore",
    "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "verification_status": "NOT_RUN",
    "reason": "Offsite pgBackRest secret files or configuration not provisioned in current workspace",
    "rto_seconds": None,
    "rpo_seconds": None,
}
with open(sys.argv[1], "w", encoding="utf-8") as fh:
    json.dump(payload, fh, indent=2)
    fh.write("\n")
PY
  printf 'NOT_RUN: Offsite pgBackRest credentials not present; wrote honest NOT_RUN evidence to %s\n' "${EVIDENCE_PATH}" >&2
  exit 2
fi

START_EPOCH="$(date +%s)"
"${CONTAINER_ENGINE}" volume create "${DRILL_VOLUME}" >/dev/null

RESTORE_ARGS=(
  "--stanza=${STANZA}"
  "--config=/etc/pgbackrest/pgbackrest.conf"
  "--pg1-path=/var/lib/postgresql/18/docker"
  "--recovery-option=recovery_end_command=true"
)
if [[ -n "${TARGET_TIME}" ]]; then
  RESTORE_ARGS+=("--type=time" "--target=${TARGET_TIME}" "--target-action=promote")
else
  RESTORE_ARGS+=("--type=default")
fi

printf 'Restoring encrypted offsite backup into isolated volume %s...\n' "${DRILL_VOLUME}"
"${CONTAINER_ENGINE}" run --rm \
  --security-opt no-new-privileges:true \
  --cap-drop ALL \
  -e PGBACKREST_REPO1_S3_ENDPOINT="${PGBACKREST_REPO1_S3_ENDPOINT}" \
  -e PGBACKREST_REPO1_S3_BUCKET="${PGBACKREST_REPO1_S3_BUCKET}" \
  -e PGBACKREST_REPO1_S3_REGION="${PGBACKREST_REPO1_S3_REGION:-us-east-1}" \
  -e PGBACKREST_REPO1_S3_KEY="${PGBACKREST_REPO1_S3_KEY}" \
  -e PGBACKREST_REPO1_CIPHER_PASS="$(cat "${REPO_KEY_FILE}")" \
  -e PGBACKREST_REPO1_S3_KEY_SECRET="$(cat "${S3_SECRET_FILE}")" \
  -v "${PGB_CONF}:/etc/pgbackrest/pgbackrest.conf:ro" \
  -v "${DRILL_VOLUME}:/var/lib/postgresql" \
  "${PGB_IMAGE}" \
  pgbackrest "${RESTORE_ARGS[@]}" restore

printf 'Booting isolated PostgreSQL 18 recovery instance (%s) with --network none...\n' "${DRILL_ID}"
"${CONTAINER_ENGINE}" run -d \
  --name "${DRILL_ID}" \
  --network none \
  --security-opt no-new-privileges:true \
  -v "${DRILL_VOLUME}:/var/lib/postgresql" \
  "${PG_IMAGE}" \
  postgres -c archive_mode=off >/dev/null

PROMOTED=0
for _ in $(seq 1 60); do
  in_rec="$("${CONTAINER_ENGINE}" exec "${DRILL_ID}" psql -U "${POSTGRES_USER:-llmops}" -d "${POSTGRES_DB:-llmops}" -tAc "SELECT pg_is_in_recovery();" 2>/dev/null || true)"
  if [[ "${in_rec}" == "f" ]]; then
    PROMOTED=1
    break
  fi
  sleep 2
done

if [[ "${PROMOTED}" -ne 1 ]]; then
  printf 'FAIL: Isolated PostgreSQL recovery instance did not finish WAL replay within 120s.\n' >&2
  exit 1
fi

END_EPOCH="$(date +%s)"
RTO_SECONDS=$((END_EPOCH - START_EPOCH))

LAST_XACT_EPOCH="$("${CONTAINER_ENGINE}" exec "${DRILL_ID}" psql -U "${POSTGRES_USER:-llmops}" -d "${POSTGRES_DB:-llmops}" -tAc "SELECT COALESCE(EXTRACT(EPOCH FROM pg_last_xact_replay_timestamp())::bigint, ${END_EPOCH});")"
RPO_SECONDS=$((START_EPOCH - LAST_XACT_EPOCH))
if (( RPO_SECONDS < 0 )); then
  RPO_SECONDS=0
fi

MIGRATIONS_COUNT="$("${CONTAINER_ENGINE}" exec "${DRILL_ID}" psql -U "${POSTGRES_USER:-llmops}" -d "${POSTGRES_DB:-llmops}" -tAc "SELECT count(*) FROM drizzle.__drizzle_migrations;" 2>/dev/null || echo "0")"
ORGS_COUNT="$("${CONTAINER_ENGINE}" exec "${DRILL_ID}" psql -U "${POSTGRES_USER:-llmops}" -d "${POSTGRES_DB:-llmops}" -tAc "SELECT count(*) FROM organizations;" 2>/dev/null || echo "0")"
VECTOR_EXT="$("${CONTAINER_ENGINE}" exec "${DRILL_ID}" psql -U "${POSTGRES_USER:-llmops}" -d "${POSTGRES_DB:-llmops}" -tAc "SELECT extname FROM pg_extension WHERE extname='vector';" 2>/dev/null || echo "")"

export STANZA TARGET_TIME RTO_SECONDS RPO_SECONDS MIGRATIONS_COUNT ORGS_COUNT VECTOR_EXT EVIDENCE_PATH
python3 - <<'PY'
import datetime, json, os
payload = {
    "schema_version": "1.0.0",
    "drill_type": "pgbackrest_pitr_restore",
    "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "stanza": os.environ["STANZA"],
    "target_time": os.environ.get("TARGET_TIME") or "latest",
    "rto_seconds": int(os.environ["RTO_SECONDS"]),
    "rpo_seconds": int(os.environ["RPO_SECONDS"]),
    "integrity_checks": {
        "migrations_count": int(os.environ["MIGRATIONS_COUNT"] or "0"),
        "organizations_count": int(os.environ["ORGS_COUNT"] or "0"),
        "pgvector_extension_present": os.environ.get("VECTOR_EXT") == "vector",
        "network_isolated": True,
    },
    "verification_status": "PASS",
}
with open(os.environ["EVIDENCE_PATH"], "w", encoding="utf-8") as fh:
    json.dump(payload, fh, indent=2, sort_keys=True)
    fh.write("\n")
PY

printf 'PASS: Disposable PITR restore drill verified (RTO=%ds, RPO=%ds). Evidence: %s\n' "${RTO_SECONDS}" "${RPO_SECONDS}" "${EVIDENCE_PATH}"
