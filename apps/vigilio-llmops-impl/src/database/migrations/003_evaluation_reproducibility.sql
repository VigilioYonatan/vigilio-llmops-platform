-- Pin every newly created evaluation to an immutable dataset snapshot and fence stale workers.
ALTER TABLE evaluation_runs ADD COLUMN IF NOT EXISTS dataset_version_id uuid REFERENCES dataset_versions(id);
ALTER TABLE evaluation_runs ADD COLUMN IF NOT EXISTS lease_token uuid;
CREATE INDEX IF NOT EXISTS evaluation_runs_snapshot_idx ON evaluation_runs(dataset_version_id) WHERE dataset_version_id IS NOT NULL;
