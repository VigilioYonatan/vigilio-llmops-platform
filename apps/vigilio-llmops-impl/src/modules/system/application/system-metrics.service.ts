import { Inject, Injectable } from '@nestjs/common';
import { SQL_PORT, type SqlPort } from '../../../shared/ports/sql.port';

@Injectable()
export class SystemMetricsService {
  constructor(@Inject(SQL_PORT) private readonly db: SqlPort) {}

  async snapshot() {
    const [pendingOutbox, deadLetterOutbox, activeRuns, pendingReservations] =
      await Promise.all([
        this.db.one<{ value: string }>(
          'SELECT count(*)::text AS value FROM outbox_events WHERE published_at IS NULL AND dead_lettered_at IS NULL',
        ),
        this.db.one<{ value: string }>(
          'SELECT count(*)::text AS value FROM outbox_events WHERE dead_lettered_at IS NOT NULL',
        ),
        this.db.one<{ value: string }>(
          "SELECT count(*)::text AS value FROM evaluation_runs WHERE status IN ('queued', 'running')",
        ),
        this.db.one<{ value: string }>(
          "SELECT count(*)::text AS value FROM budget_reservations WHERE status = 'reserved'",
        ),
      ]);

    return [
      '# HELP vigilio_process_uptime_seconds Process uptime in seconds',
      '# TYPE vigilio_process_uptime_seconds gauge',
      `vigilio_process_uptime_seconds ${Math.floor(process.uptime())}`,
      '# HELP vigilio_outbox_pending_events Queued outbox events',
      '# TYPE vigilio_outbox_pending_events gauge',
      `vigilio_outbox_pending_events ${Number(pendingOutbox?.value ?? 0)}`,
      '# HELP vigilio_outbox_dead_lettered_events Dead-lettered outbox events',
      '# TYPE vigilio_outbox_dead_lettered_events gauge',
      `vigilio_outbox_dead_lettered_events ${Number(deadLetterOutbox?.value ?? 0)}`,
      '# HELP vigilio_evaluation_active_runs Queued or running evaluation runs',
      '# TYPE vigilio_evaluation_active_runs gauge',
      `vigilio_evaluation_active_runs ${Number(activeRuns?.value ?? 0)}`,
      '# HELP vigilio_budget_pending_reservations Active unsettled budget reservations',
      '# TYPE vigilio_budget_pending_reservations gauge',
      `vigilio_budget_pending_reservations ${Number(pendingReservations?.value ?? 0)}`,
    ];
  }
}
