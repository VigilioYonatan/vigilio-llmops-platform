import { setTimeout as sleep } from 'node:timers/promises';
import { connect, headers, JSONCodec } from 'nats';
import { DatabaseService } from '../database/database.service';
import { config } from '../shared/config';
import type { SqlPort } from '../shared/ports/sql.port';

export type OutboxRow = {
  id: string;
  topic: string;
  payload: unknown;
  attempts: number;
};

export const MAX_OUTBOX_ATTEMPTS = 10;

export async function processOutboxBatch(
  db: SqlPort,
  publishFn: (
    topic: string,
    eventId: string,
    payload: unknown,
  ) => Promise<void>,
): Promise<number> {
  // 1. Short claim transaction: never hold PostgreSQL row locks across network I/O.
  const claimed = await db.tx(async (client) => {
    const result = await client.query<OutboxRow>(
      `WITH candidate AS (
         SELECT id
         FROM outbox_events
         WHERE published_at IS NULL
           AND dead_lettered_at IS NULL
           AND (locked_at IS NULL OR locked_at < now() - interval '2 minutes')
         ORDER BY created_at ASC
         LIMIT 30
         FOR UPDATE SKIP LOCKED
       )
       UPDATE outbox_events o
       SET locked_at = now()
       FROM candidate c
       WHERE o.id = c.id
       RETURNING o.id, o.topic, o.payload, o.attempts`,
    );
    return result.rows;
  });

  // 2. Publish outside DB transaction and record outcome per event.
  for (const event of claimed) {
    try {
      await publishFn(event.topic, event.id, event.payload);
      await db.rows(
        'UPDATE outbox_events SET published_at = now(), locked_at = NULL, attempts = attempts + 1, last_error = NULL WHERE id = $1',
        [event.id],
      );
    } catch (error) {
      const reason =
        error instanceof Error
          ? error.message.slice(0, 500)
          : 'Unknown publish error';
      await db.rows(
        `UPDATE outbox_events
         SET locked_at = NULL,
             attempts = attempts + 1,
             last_error = $2,
             dead_lettered_at = CASE WHEN attempts + 1 >= $3 THEN now() ELSE NULL END
         WHERE id = $1`,
        [event.id, reason, MAX_OUTBOX_ATTEMPTS],
      );
    }
  }
  return claimed.length;
}

export async function runOutbox(): Promise<void> {
  const db = new DatabaseService();
  const nc = await connect({
    servers: config.NATS_URL,
    name: 'vigilio-outbox',
  });
  const js = nc.jetstream();
  const codec = JSONCodec();
  process.once('SIGTERM', () => {
    void nc.drain();
  });
  try {
    while (!nc.isClosed()) {
      const processed = await processOutboxBatch(
        db,
        async (topic, eventId, payload) => {
          const head = headers();
          head.set('Nats-Msg-Id', eventId);
          await js.publish(
            `events.${topic}`,
            codec.encode({ event_id: eventId, payload }),
            { headers: head },
          );
        },
      );
      if (!processed) {
        await sleep(1000);
      }
    }
  } finally {
    await db.onModuleDestroy();
    await nc.drain();
  }
}
