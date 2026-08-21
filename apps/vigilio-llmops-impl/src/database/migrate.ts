import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseService } from './database.service';

function resolveMigrationsDir(): string {
  const local = join(__dirname, 'migrations');
  if (existsSync(local)) return local;
  const relativeSrc = join(
    __dirname,
    '..',
    '..',
    'src',
    'database',
    'migrations',
  );
  if (existsSync(relativeSrc)) return relativeSrc;
  const fallback = join(process.cwd(), 'src', 'database', 'migrations');
  if (existsSync(fallback)) return fallback;
  const implFallback = join(
    process.cwd(),
    'apps',
    'vigilio-llmops-impl',
    'src',
    'database',
    'migrations',
  );
  if (existsSync(implFallback)) return implFallback;
  throw new Error(`Migrations directory not found near ${__dirname}`);
}

export async function migrate(): Promise<void> {
  const databaseService = new DatabaseService();
  const directory = resolveMigrationsDir();
  try {
    const migrations = readdirSync(directory)
      .filter((name) => name.endsWith('.sql'))
      .sort();
    for (const name of migrations) {
      await databaseService.tx(async (client) => {
        await client.query('SELECT pg_advisory_xact_lock(83455517)');
        await client.query(
          'CREATE TABLE IF NOT EXISTS schema_migrations(version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
        );
        const applied = await client.query(
          'SELECT version FROM schema_migrations WHERE version=$1',
          [name],
        );
        if (applied.rowCount) return;
        await client.query(readFileSync(join(directory, name), 'utf8'));
        await client.query(
          'INSERT INTO schema_migrations(version) VALUES ($1)',
          [name],
        );
      });
      process.stdout.write(
        `migration ${name}: applied or previously present\n`,
      );
    }
  } finally {
    await databaseService.onModuleDestroy();
  }
}
