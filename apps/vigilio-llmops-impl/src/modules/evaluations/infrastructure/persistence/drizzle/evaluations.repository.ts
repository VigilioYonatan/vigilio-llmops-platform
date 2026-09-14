import { Inject, Injectable } from '@nestjs/common';
import { SQL_PORT, type SqlPort } from '../../../../../shared/ports/sql.port';
import type {
  EvaluationRunRecord,
  EvaluationsRepository,
} from '../../../application/ports/evaluations.port';

@Injectable()
export class EvaluationsDrizzleRepository implements EvaluationsRepository {
  constructor(@Inject(SQL_PORT) private readonly sql: SqlPort) {}

  async findById(id: string): Promise<EvaluationRunRecord | null> {
    const row = await this.sql.one<EvaluationRunRecord>(
      `SELECT id, organization_id, workspace_id, dataset_id, dataset_version_id, prompt_version_id, evaluator_version_id, status, score, total_cases, passed_cases, created_at, finished_at
       FROM evaluation_runs
       WHERE id = $1`,
      [id],
    );
    return row ?? null;
  }

  async listByWorkspace(workspaceId: string): Promise<EvaluationRunRecord[]> {
    return this.sql.rows<EvaluationRunRecord>(
      `SELECT id, organization_id, workspace_id, dataset_id, dataset_version_id, prompt_version_id, evaluator_version_id, status, score, total_cases, passed_cases, created_at, finished_at
       FROM evaluation_runs
       WHERE workspace_id = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [workspaceId],
    );
  }
}
