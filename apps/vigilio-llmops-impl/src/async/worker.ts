import { connect, JSONCodec } from 'nats';
import { z } from 'zod';
import { DatabaseService } from '../database/database.service';
import { EvaluationsService } from '../modules/evaluations/application/evaluations.service';
import { ModelInferenceService } from '../modules/gateway/application/model-inference.service';
import { AuditService } from '../shared/audit.service';
import { config } from '../shared/config';
import { decryptSecret, sha256 } from '../shared/crypto';
import type { SqlPort } from '../shared/ports/sql.port';
import { TenancyService } from '../shared/tenancy.service';

const eventSchema = z.object({
  event_id: z.uuid(),
  payload: z.record(z.string(), z.unknown()),
});

export class PermanentWorkerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentWorkerError';
  }
}

export interface WorkerDependencies {
  db: SqlPort;
  evaluator: Pick<EvaluationsService, 'execute'>;
  audit: Pick<AuditService, 'write'>;
  sendMail?: (options: {
    from: string;
    to: string;
    subject: string;
    text: string;
  }) => Promise<void>;
}

export async function sweepOperationalRetention(db: SqlPort): Promise<{
  expired_reservations: number;
  purged_tokens: number;
}> {
  const expired = await db.tx(async (client) => {
    const stale = await client.query<{
      id: string;
      organization_id: string;
      estimated_usd: string;
    }>(
      `UPDATE budget_reservations
       SET status = 'expired'
       WHERE status = 'reserved' AND created_at < now() - interval '15 minutes'
       RETURNING id, organization_id, estimated_usd`,
    );
    for (const row of stale.rows) {
      await client.query(
        'UPDATE budget_policies SET spent_usd = GREATEST(0, spent_usd - $2::numeric) WHERE organization_id = $1',
        [row.organization_id, row.estimated_usd],
      );
    }
    return stale.rowCount ?? 0;
  });

  const purged = await db.one<{ total: number }>(
    `WITH a AS (DELETE FROM oauth_transactions WHERE expires_at < now() - interval '7 days' RETURNING 1),
          b AS (DELETE FROM mfa_login_challenges WHERE expires_at < now() - interval '7 days' RETURNING 1),
          c AS (DELETE FROM email_tokens WHERE expires_at < now() - interval '7 days' RETURNING 1),
          d AS (DELETE FROM email_change_tokens WHERE expires_at < now() - interval '7 days' RETURNING 1)
     SELECT (SELECT count(*) FROM a) + (SELECT count(*) FROM b) + (SELECT count(*) FROM c) + (SELECT count(*) FROM d) AS total`,
  );

  return {
    expired_reservations: expired,
    purged_tokens: Number(purged?.total ?? 0),
  };
}

export async function processWorkerEvent(
  deps: WorkerDependencies,
  subject: string,
  rawDecoded: unknown,
): Promise<{ status: 'processed' | 'duplicate' }> {
  const parsed = eventSchema.safeParse(rawDecoded);
  if (!parsed.success) {
    throw new PermanentWorkerError('Malformed event envelope');
  }
  const event = parsed.data;
  const topic = subject.replace(/^events\./, '');

  const alreadySeen = await deps.db.one<{ event_id: string }>(
    'SELECT event_id FROM processed_events WHERE consumer = $1 AND event_id = $2',
    ['platform-worker', event.event_id],
  );
  if (alreadySeen) {
    return { status: 'duplicate' };
  }

  if (topic === 'trace.ingested') {
    const traceId = event.payload.trace_record_id;
    if (typeof traceId !== 'string')
      throw new PermanentWorkerError('trace_record_id missing');
    await deps.db.tx(async (client) => {
      const claim = await client.query<{ event_id: string }>(
        'INSERT INTO processed_events(consumer, event_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING event_id',
        ['platform-worker', event.event_id],
      );
      if (!claim.rowCount) return;

      const traceRes = await client.query<{
        id: string;
        workspace_id: string;
        organization_id: string;
      }>('SELECT id, workspace_id, organization_id FROM traces WHERE id = $1', [
        traceId,
      ]);
      const trace = traceRes.rows[0];
      if (!trace) return;

      const measurements = await client.query<{
        rule_id: string;
        workspace_id: string;
        organization_id: string;
        name: string;
        metric: string;
        threshold: string;
        comparator: string;
        value: string;
      }>(
        `WITH recent AS (
           SELECT workspace_id,
                  COUNT(*)::numeric AS total,
                  COUNT(*) FILTER (WHERE status <> 'success')::numeric AS errors,
                  COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms), 0)::numeric AS p95,
                  COALESCE(SUM(estimated_cost_usd), 0)::numeric AS cost
           FROM traces
           WHERE workspace_id = $1 AND created_at >= now() - interval '5 minutes'
           GROUP BY workspace_id
         )
         SELECT r.id AS rule_id,
                r.workspace_id,
                r.organization_id,
                r.name,
                r.metric,
                r.threshold::text,
                r.comparator,
                (CASE WHEN r.metric = 'error_rate' THEN COALESCE(v.errors / NULLIF(v.total, 0), 0)
                      WHEN r.metric = 'latency_p95_ms' THEN v.p95
                      ELSE v.cost END)::text AS value
         FROM alert_rules r
         JOIN recent v ON v.workspace_id = r.workspace_id
         WHERE r.workspace_id = $1 AND r.enabled = true`,
        [trace.workspace_id],
      );

      for (const m of measurements.rows) {
        const actual = Number(m.value);
        const threshold = Number(m.threshold);
        const triggered =
          m.comparator === 'gte' ? actual >= threshold : actual > threshold;
        if (triggered) {
          await client.query(
            `INSERT INTO alerts(organization_id, workspace_id, rule_id, severity, title, source_event_id)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (rule_id, source_event_id) DO NOTHING`,
            [
              m.organization_id,
              m.workspace_id,
              m.rule_id,
              actual >= threshold * 2 && threshold > 0 ? 'critical' : 'warning',
              `${m.name}: ${m.metric}=${m.value}`,
              event.event_id,
            ],
          );
        }
      }
    });
    return { status: 'processed' };
  }

  if (topic === 'evaluation.run') {
    const runId = event.payload.run_id;
    if (typeof runId !== 'string')
      throw new PermanentWorkerError('run_id missing');
    await deps.evaluator.execute(runId);
    await deps.db.rows(
      'INSERT INTO processed_events(consumer, event_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      ['platform-worker', event.event_id],
    );
    return { status: 'processed' };
  }

  if (topic === 'privacy.facebook.delete') {
    const identityId = event.payload.identity_id;
    if (typeof identityId !== 'string')
      throw new PermanentWorkerError('identity_id missing');
    await deps.db.tx(async (client) => {
      const claim = await client.query<{ event_id: string }>(
        'INSERT INTO processed_events(consumer, event_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING event_id',
        ['platform-worker', event.event_id],
      );
      if (!claim.rowCount) return;

      const ticket = await client.query<{ id: string }>(
        "SELECT id FROM deletion_requests WHERE identity_id = $1 AND status IN ('queued', 'processing') FOR UPDATE",
        [identityId],
      );
      if (!ticket.rowCount) return;
      const ticketId = ticket.rows[0]?.id;
      await client.query(
        "UPDATE deletion_requests SET status = 'processing' WHERE id = $1",
        [ticketId],
      );

      const identity = await client.query<{ user_id: string; subject: string }>(
        "SELECT user_id, subject FROM social_identities WHERE id = $1 AND provider = 'facebook' FOR UPDATE",
        [identityId],
      );
      let requiresTenantReview = false;

      if (identity.rowCount) {
        const { user_id: userId, subject: fbSubject } = identity.rows[0]!;
        await client.query('DELETE FROM social_identities WHERE id = $1', [
          identityId,
        ]);

        const remainingAuth = await client.query<{ available: boolean }>(
          'SELECT EXISTS(SELECT 1 FROM user_credentials WHERE user_id = $1 UNION ALL SELECT 1 FROM social_identities WHERE user_id = $1) AS available',
          [userId],
        );
        const tenantMembership = await client.query<{ present: boolean }>(
          'SELECT EXISTS(SELECT 1 FROM memberships WHERE user_id = $1) AS present',
          [userId],
        );
        requiresTenantReview = Boolean(tenantMembership.rows[0]?.present);

        if (!remainingAuth.rows[0]?.available) {
          await client.query(
            "UPDATE users SET email = 'erased-' || id::text || '@deleted.invalid', display_name = 'Deleted user', disabled_at = now(), email_verified = false WHERE id = $1",
            [userId],
          );
          await client.query(
            'DELETE FROM session_rotation_history WHERE user_id = $1',
            [userId],
          );
          await client.query('DELETE FROM user_sessions WHERE user_id = $1', [
            userId,
          ]);
          await client.query('DELETE FROM email_tokens WHERE user_id = $1', [
            userId,
          ]);
          await client.query(
            'DELETE FROM email_change_tokens WHERE user_id = $1',
            [userId],
          );
          await client.query(
            'DELETE FROM mfa_recovery_codes WHERE user_id = $1',
            [userId],
          );
          await client.query('DELETE FROM mfa_factors WHERE user_id = $1', [
            userId,
          ]);
          await client.query(
            'DELETE FROM mfa_login_challenges WHERE user_id = $1',
            [userId],
          );
          // Preserve legal consent proof with pseudonymized subject_hash (never delete consent_receipts).
          await client.query(
            'UPDATE consent_receipts SET user_id = NULL, subject_hash = COALESCE(subject_hash, $2), minimized_at = now() WHERE user_id = $1',
            [userId, sha256(`facebook:${fbSubject}:${userId}`)],
          );
        }
        await client.query(
          'INSERT INTO audit_events(action, actor_id, organization_id, resource_type, resource_id, metadata) VALUES ($1, NULL, NULL, $2, $3, $4)',
          [
            'privacy.facebook_deletion_processed',
            'deletion_request',
            ticketId,
            JSON.stringify({ requires_tenant_review: requiresTenantReview }),
          ],
        );
      }

      const finalStatus = requiresTenantReview
        ? 'requires_review'
        : 'completed';
      await client.query(
        "UPDATE deletion_requests SET status = $2::text, completed_at = CASE WHEN $2::text = 'completed' THEN now() ELSE NULL END WHERE id = $1",
        [ticketId, finalStatus],
      );
    });
    return { status: 'processed' };
  }

  if (topic.startsWith('email.')) {
    const email = event.payload.email;
    const encrypted = event.payload.token_encrypted;
    if (typeof email !== 'string' || typeof encrypted !== 'string') {
      throw new PermanentWorkerError('Invalid email event payload');
    }
    const token = decryptSecret(encrypted);
    const path =
      topic === 'email.verify'
        ? '/auth/verify'
        : topic === 'email.change'
          ? '/auth/email-change'
          : topic === 'email.invite'
            ? '/app/invitations'
            : '/auth/reset';
    const url = new URL(path, config.WEB_ORIGIN);
    url.searchParams.set('token', token);
    if (topic === 'email.invite') {
      const id = event.payload.invitation_id;
      if (typeof id !== 'string')
        throw new PermanentWorkerError('Invitation id missing');
      url.searchParams.set('id', id);
    }
    const mailOptions = {
      from: process.env.SMTP_FROM ?? 'no-reply@vigilio.local',
      to: email,
      subject:
        topic === 'email.verify'
          ? 'Verify your Vigilio account'
          : topic === 'email.change'
            ? 'Confirm your new email address'
            : topic === 'email.invite'
              ? 'Invitation to Vigilio LLMOps'
              : 'Reset your Vigilio password',
      text: `Open this link to continue: ${url.toString()}`,
    };
    if (deps.sendMail) {
      await deps.sendMail(mailOptions);
    } else {
      const host = process.env.SMTP_HOST;
      if (!host)
        throw new Error('SMTP_HOST must be set before mail jobs can succeed');
      const nodemailer = await import('nodemailer');
      const transporter = nodemailer.createTransport({
        host,
        port: Number(process.env.SMTP_PORT ?? 587),
        secure: false,
        auth: process.env.SMTP_USERNAME
          ? { user: process.env.SMTP_USERNAME, pass: process.env.SMTP_PASSWORD }
          : undefined,
      });
      await transporter.sendMail(mailOptions);
    }
    await deps.db.rows(
      'INSERT INTO processed_events(consumer, event_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      ['platform-worker', event.event_id],
    );
    return { status: 'processed' };
  }

  // Acknowledge non-worker informational outbox events (e.g. release.activated) idempotently.
  await deps.db.rows(
    'INSERT INTO processed_events(consumer, event_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    ['platform-worker', event.event_id],
  );
  return { status: 'processed' };
}

export async function runWorker(): Promise<void> {
  const db = new DatabaseService();
  const nc = await connect({
    servers: config.NATS_URL,
    name: 'vigilio-worker',
  });
  const js = nc.jetstream();
  const consumer = await js.consumers.get('VIGILIO', 'platform-worker');
  const messages = await consumer.consume({ max_messages: 20 });
  const evaluator = new EvaluationsService(
    db,
    new TenancyService(db),
    new ModelInferenceService(),
  );
  const audit = new AuditService(db);
  const codec = JSONCodec();

  const retentionTimer = setInterval(() => {
    void sweepOperationalRetention(db).catch(() => undefined);
  }, 60_000);
  retentionTimer.unref();

  process.once('SIGTERM', () => {
    clearInterval(retentionTimer);
    void messages.close();
  });

  try {
    await sweepOperationalRetention(db).catch(() => undefined);
    for await (const message of messages) {
      let decoded: unknown = null;
      try {
        decoded = codec.decode(message.data);
        await processWorkerEvent(
          { db, evaluator, audit },
          message.subject,
          decoded,
        );
        message.ack();
      } catch (error) {
        const isPermanent = error instanceof PermanentWorkerError;
        const deliveryCount = message.info.deliveryCount;
        console.error(
          'worker event failed',
          error instanceof Error ? error.name : 'UnknownError',
        );
        if (isPermanent || deliveryCount >= 10) {
          const dlqEnvelope = {
            original_subject: message.subject,
            delivery_count: deliveryCount,
            failed_at: new Date().toISOString(),
            error:
              error instanceof Error
                ? error.message.slice(0, 300)
                : 'UnknownError',
            payload: decoded,
          };
          await js.publish(
            'deadletter.platform-worker',
            codec.encode(dlqEnvelope),
          );
          message.ack();
        } else {
          message.nak(Math.min(60_000, deliveryCount * 5_000));
        }
      }
    }
  } finally {
    clearInterval(retentionTimer);
    await db.onModuleDestroy();
    await nc.drain();
  }
}
