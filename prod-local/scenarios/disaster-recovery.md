# Disaster recovery rehearsal
Use a clean **isolated** PostgreSQL recovery target. Verify PITR timestamp and organization/application counts. Never overwrite the source database. Block production promotion if WAL repository is local-only, stale or inaccessible.
