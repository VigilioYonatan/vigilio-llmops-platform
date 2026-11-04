# platform-ops — Reusable Cloud-Neutral Linux VPS Automation

Idempotent, product-agnostic Ansible baseline preparing self-hosted Linux VPS nodes for Rootless Podman Compose, Sigstore `cosign` digest verification, and encrypted offsite `pgBackRest` PITR backups.

## Roles

1. **`host_baseline`** — Unprivileged operator account, `/etc/subuid` + `/etc/subgid`, `loginctl enable-linger`, sysctl (`net.ipv4.ip_unprivileged_port_start=80`), hardened `/etc/ssh/sshd_config` (`PermitRootLogin no`, `PasswordAuthentication no`, `validate: '/usr/sbin/sshd -t -f %s'`) with safe SSH handler flush **before** UFW port-22 denial, HTTP/3 (`80/tcp`, `443/tcp`, `443/udp`), `fail2ban` (`jail.local`), `auditd`, and `unattended-upgrades`.
2. **`cosign_verify`** — Checksum-verified `cosign` binary installation and fail-closed OIDC signature + SLSA v1.2 provenance verification on `@sha256` OCI digests.
3. **`pgbackrest_host`** — Host-level `pgBackRest` S3 + `aes-256-cbc` configuration and hardened systemd `full`/`diff` timers (rejects local-disk `posix` repositories outside explicit test labs).

## Usage

```bash
# 1. Syntax check
ansible-playbook -i inventories/staging/hosts.ini playbooks/bootstrap-vps.yml --syntax-check

# 2. Dry-run diff against staging
ansible-playbook -i inventories/staging/hosts.ini playbooks/bootstrap-vps.yml --check --diff

# 3. Apply full bootstrap with UFW enabled from approved bastion CIDR
ansible-playbook -i inventories/staging/hosts.ini playbooks/bootstrap-vps.yml \
  -e vigilio_manage_firewall=true
```
