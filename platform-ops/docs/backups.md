# Backup posture
- Production needs **independent** destination for encrypted pgBackRest backups + continuous WAL archiving.
- No configuration assumes that `postgres_data` Compose volume is a backup.
- Verify restore at isolated target and RPO/RTO; keep checksums and drill evidence.
- Configure and audit offsite transport per organization; do not assume public cloud.
- All database and encryption credentials must be external to Git/ZIP.
