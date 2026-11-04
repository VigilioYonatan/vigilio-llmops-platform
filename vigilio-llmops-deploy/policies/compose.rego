package main

import rego.v1

# 1. Caddy MUST NOT attach to internal `backend` network
deny contains msg if {
  svc := input.services.caddy
  some net in service_networks(svc)
  net == "backend"
  msg := "SECURITY VIOLATION: caddy must NEVER be attached to internal `backend` network"
}

# 2. Internal networks (`reverse_proxy`, `backend`, `observability`) MUST enforce `internal: true`
required_internal_networks := {"reverse_proxy", "backend", "observability"}

deny contains msg if {
  some net_name in required_internal_networks
  net_cfg := object.get(input.networks, net_name, {})
  object.get(net_cfg, "internal", false) != true
  msg := sprintf("SECURITY VIOLATION: network `%s` must exist and set `internal: true`", [net_name])
}

# 3. Stateful data stores (`postgres`, `valkey`, `nats`) MUST NOT publish host ports
forbidden_port_services := {"postgres", "valkey", "nats", "tempo", "loki", "prometheus", "alertmanager", "grafana", "pgbackrest"}

deny contains msg if {
  some svc_name in forbidden_port_services
  svc := object.get(input.services, svc_name, {})
  count(object.get(svc, "ports", [])) > 0
  msg := sprintf("SECURITY VIOLATION: service `%s` must not publish host ports", [svc_name])
}

# 4. Every service MUST drop ALL capabilities, disable privilege escalation, and declare resource limits
deny contains msg if {
  some svc_name, svc in input.services
  caps := object.get(svc, "cap_drop", [])
  not "ALL" in caps
  msg := sprintf("HARDENING VIOLATION: service `%s` must set `cap_drop: [ALL]`", [svc_name])
}

deny contains msg if {
  some svc_name, svc in input.services
  sec_opts := object.get(svc, "security_opt", [])
  not "no-new-privileges:true" in sec_opts
  msg := sprintf("HARDENING VIOLATION: service `%s` must set `security_opt: [no-new-privileges:true]`", [svc_name])
}

deny contains msg if {
  some svc_name, svc in input.services
  not svc.cpus
  msg := sprintf("RESOURCE VIOLATION: service `%s` must define `cpus` limit", [svc_name])
}

deny contains msg if {
  some svc_name, svc in input.services
  not svc.mem_limit
  msg := sprintf("RESOURCE VIOLATION: service `%s` must define `mem_limit`", [svc_name])
}

deny contains msg if {
  some svc_name, svc in input.services
  not svc.pids_limit
  msg := sprintf("RESOURCE VIOLATION: service `%s` must define `pids_limit`", [svc_name])
}

service_networks(svc) := nets if {
  is_array(svc.networks)
  nets := {n | some n in svc.networks}
}

service_networks(svc) := nets if {
  is_object(svc.networks)
  nets := {n | some n, _ in svc.networks}
}
