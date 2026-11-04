#!/usr/bin/env bash
set -euo pipefail

required_vars=(
  BACKEND_IMAGE
  WEB_IMAGE
  POSTGRES_IMAGE
  VALKEY_IMAGE
  NATS_IMAGE
  CADDY_IMAGE
  OTEL_IMAGE
  ALLOY_IMAGE
  TEMPO_IMAGE
  LOKI_IMAGE
  PROMETHEUS_IMAGE
  ALERTMANAGER_IMAGE
  GRAFANA_IMAGE
)

if [[ "${VERIFY_BACKUP_IMAGES:-true}" == "true" ]]; then
  required_vars+=(PGBACKREST_IMAGE)
fi

for variable in "${required_vars[@]}"; do
  image="${!variable:-}"
  if [[ -z "${image}" ]]; then
    printf 'FAIL: %s is unset or empty\n' "${variable}" >&2
    exit 1
  fi
  if [[ ! "${image}" =~ @sha256:[0-9a-f]{64}$ ]]; then
    printf 'FAIL: %s must reference an immutable @sha256 digest, got: %s\n' "${variable}" "${image}" >&2
    exit 1
  fi
done

printf 'PASS: All %d runtime image references are pinned by immutable @sha256 digest.\n' "${#required_vars[@]}"
