import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool, type PoolClient } from 'pg';
import { config } from '../shared/config';
import type { SqlPort, SqlTxClient } from '../shared/ports/sql.port';
import * as schema from './schema';

@Injectable()
export class DatabaseService implements SqlPort, OnModuleDestroy {
  readonly pool: Pool;
  readonly orm: NodePgDatabase<typeof schema>;

  constructor() {
    this.pool = new Pool({
      connectionString: config.DATABASE_URL,
      max: 15,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      ssl:
        config.DB_SSL_MODE === 'verify-full'
          ? { rejectUnauthorized: true }
          : false,
    });
    this.orm = drizzle(this.pool, { schema });
  }

  async rows<T = any>(text: string, params: unknown[] = []): Promise<T[]> {
    const result = await this.pool.query<any>(text, params);
    return result.rows as T[];
  }

  async one<T = any>(text: string, params: unknown[] = []): Promise<T | null> {
    const rows = await this.rows<T>(text, params);
    return rows[0] ?? null;
  }

  async tx<T>(
    fn: (client: SqlTxClient & PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client as SqlTxClient & PoolClient);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
