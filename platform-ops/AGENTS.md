# platform-ops — Reusable Host Automation Governance

- Keep all Ansible roles (`host_baseline`, `cosign_verify`, `pgbackrest_host`) **cloud-neutral, idempotent, and product-agnostic** (never hardcode business domains or alert thresholds in roles).
- Validate every role interface with `meta/argument_specs.yml`.
- Prevent SSH lockouts: always validate `/etc/ssh/sshd_config` (`validate: '/usr/sbin/sshd -t -f %s'`), allow `vigilio_ssh_port` in UFW, and `meta: flush_handlers` **before** denying legacy port `22/tcp` and enabling UFW default-deny.
- Operate containers via Rootless Podman (`/etc/subuid`, `/etc/subgid`, `loginctl enable-linger`, `net.ipv4.ip_unprivileged_port_start=80`).
- Never commit SSH private keys, Vault passwords, or live host IPs.
