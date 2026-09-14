import { createHash, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SQL_PORT, type SqlPort } from '../../../shared/ports/sql.port';
import { TenancyService } from '../../../shared/tenancy.service';
import { ModelInferenceService } from '../../gateway/application/model-inference.service';
import { evaluateDeterministic } from '../domain/evaluator';
import { normalizedExactMatch, renderPrompt } from '../domain/exact-match';
import type { EvaluationRunRequestDto } from '../presentation/http/dto/evaluation.dto';

@Injectable()
export class EvaluationsService {
  constructor(
    @Inject(SQL_PORT) private readonly databaseService: SqlPort,
    private readonly tenancyService: TenancyService,
    private readonly modelInferenceService: ModelInferenceService,
  ) {}

  async create(user_id: string, body: EvaluationRunRequestDto) {
    const ws = await this.tenancyService.workspace(user_id, body.workspace_id, [
      'owner',
      'admin',
      'developer',
    ]);
    const run = await this.databaseService.tx(async (client) => {
      const valid = await client.query<{
        dataset_id: string;
        prompt_version_id: string;
      }>(
        `SELECT d.id AS dataset_id, v.id AS prompt_version_id
         FROM datasets d
         CROSS JOIN prompt_versions v
         JOIN prompts p ON p.id = v.prompt_id
         WHERE d.id = $1 AND v.id = $2 AND d.workspace_id = $3 AND p.workspace_id = $3`,
        [body.dataset_id, body.prompt_version_id, body.workspace_id],
      );
      if (!valid.rowCount) {
        throw new BadRequestException(
          'Dataset and prompt version must belong to the workspace',
        );
      }

      if (body.evaluator_version_id) {
        const ev = await client.query(
          `SELECT ev.id FROM evaluator_versions ev JOIN evaluators e ON e.id=ev.evaluator_id WHERE ev.id=$1 AND e.workspace_id=$2`,
          [body.evaluator_version_id, body.workspace_id],
        );
        if (!ev.rowCount) {
          throw new BadRequestException(
            'Evaluator version does not belong to the workspace',
          );
        }
      }

      await client.query('SELECT id FROM datasets WHERE id=$1 FOR UPDATE', [
        body.dataset_id,
      ]);
      const cases = await client.query<{
        id: string;
        input: string;
        expected_output: string;
      }>(
        'SELECT id, input, expected_output FROM dataset_cases WHERE dataset_id=$1 ORDER BY id LIMIT 501',
        [body.dataset_id],
      );
      if (!cases.rows.length)
        throw new BadRequestException('Cannot evaluate an empty dataset');
      if (cases.rows.length > 500) {
        throw new BadRequestException('Evaluation limit: 500 cases per run');
      }

      const digest = createHash('sha256')
        .update(JSON.stringify(cases.rows))
        .digest('hex');
      const latest = await client.query<{ id: string; content_digest: string }>(
        `SELECT id, content_digest FROM dataset_versions WHERE dataset_id=$1 ORDER BY version DESC LIMIT 1`,
        [body.dataset_id],
      );

      let dataset_version_id =
        latest.rows[0]?.content_digest === digest ? latest.rows[0].id : null;
      if (!dataset_version_id) {
        const number = await client.query<{ version: number }>(
          `SELECT COALESCE(MAX(version),0)::int+1 AS version FROM dataset_versions WHERE dataset_id=$1`,
          [body.dataset_id],
        );
        const created = await client.query<{ id: string }>(
          `INSERT INTO dataset_versions(dataset_id, version, content_digest, case_count, created_by)
           VALUES($1, $2, $3, $4, $5) RETURNING id`,
          [
            body.dataset_id,
            number.rows[0]?.version ?? 1,
            digest,
            cases.rows.length,
            user_id,
          ],
        );
        dataset_version_id = created.rows[0]?.id ?? null;
        for (let i = 0; i < cases.rows.length; i++) {
          const c = cases.rows[i]!;
          await client.query(
            `INSERT INTO dataset_version_cases(dataset_version_id, ordinal, case_id, input, expected_output)
             VALUES($1, $2, $3, $4, $5)`,
            [dataset_version_id, i, c.id, c.input, c.expected_output],
          );
        }
      }

      const created = await client.query<{ id: string; status: string }>(
        `INSERT INTO evaluation_runs(organization_id, workspace_id, dataset_id, dataset_version_id, prompt_version_id, evaluator_version_id, created_by)
         VALUES($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, status`,
        [
          ws.organization_id,
          body.workspace_id,
          body.dataset_id,
          dataset_version_id,
          body.prompt_version_id,
          body.evaluator_version_id ?? null,
          user_id,
        ],
      );
      await client.query(
        "INSERT INTO outbox_events(topic, payload) VALUES('evaluation.run', $1)",
        [JSON.stringify({ run_id: created.rows[0]?.id })],
      );
      return { ...created.rows[0], dataset_version_id };
    });
    return run;
  }

  async list(user_id: string, workspace_id: string) {
    await this.tenancyService.workspace(user_id, workspace_id);
    return this.databaseService.rows(
      `SELECT r.id, r.status, r.score, r.total_cases, r.passed_cases, r.prompt_version_id, r.dataset_id,
              r.created_at, r.finished_at, p.name AS prompt_name, d.name AS dataset_name
       FROM evaluation_runs r
       JOIN prompt_versions pv ON pv.id = r.prompt_version_id
       JOIN prompts p ON p.id = pv.prompt_id
       JOIN datasets d ON d.id = r.dataset_id
       WHERE r.workspace_id = $1
       ORDER BY r.created_at DESC
       LIMIT 100`,
      [workspace_id],
    );
  }

  async get(user_id: string, run_id: string) {
    const row = await this.databaseService.one<{
      id: string;
      organization_id: string;
      workspace_id: string;
      status: string;
      score: string | null;
      total_cases: number;
      passed_cases: number;
      dataset_id: string;
      created_at: Date;
      finished_at: Date | null;
    }>(
      `SELECT id, organization_id, workspace_id, status, score, total_cases, passed_cases, dataset_id, created_at, finished_at
       FROM evaluation_runs
       WHERE id = $1`,
      [run_id],
    );
    if (!row) throw new NotFoundException('Evaluation run not found');
    await this.tenancyService.membership(user_id, row.organization_id);
    return row;
  }

  async results(user_id: string, run_id: string) {
    const _run = await this.get(user_id, run_id);
    return this.databaseService.rows(
      `SELECT r.id, r.case_id, r.passed, r.actual_output, r.notes,
              COALESCE(dvc.input, dc.input) AS input,
              COALESCE(dvc.expected_output, dc.expected_output) AS expected_output
       FROM evaluation_results r
       LEFT JOIN dataset_version_cases dvc ON dvc.case_id = r.case_id
       LEFT JOIN dataset_cases dc ON dc.id = r.case_id
       WHERE r.run_id = $1
       ORDER BY r.created_at
       LIMIT 500`,
      [run_id],
    );
  }

  async execute(run_id: string): Promise<void> {
    const leaseToken = randomUUID();
    const row = await this.databaseService.one<{
      id: string;
      status: string;
      dataset_id: string;
      dataset_version_id: string | null;
      template: string;
      model: string;
      kind: 'exact_match' | 'contains' | 'regex';
    }>(
      `SELECT r.id, r.status, r.dataset_id, r.dataset_version_id, v.template, v.model,
              COALESCE(e.kind, 'exact_match') AS kind
       FROM evaluation_runs r
       JOIN prompt_versions v ON v.id = r.prompt_version_id
       LEFT JOIN evaluator_versions ev ON ev.id = r.evaluator_version_id
       LEFT JOIN evaluators e ON e.id = ev.evaluator_id
       WHERE r.id = $1`,
      [run_id],
    );
    if (!row || ['passed', 'failed', 'error', 'cancelled'].includes(row.status))
      return;

    const lease = await this.databaseService.one(
      `UPDATE evaluation_runs
       SET status = 'running', lease_token = $2, lease_until = now() + interval '5 minutes'
       WHERE id = $1 AND (status = 'queued' OR (status = 'running' AND lease_until < now()))
       RETURNING id`,
      [run_id, leaseToken],
    );
    if (!lease) return;

    const cases = await this.databaseService.rows<{
      id: string;
      input: string;
      expected_output: string;
    }>(
      row.dataset_version_id
        ? `SELECT case_id AS id, input, expected_output FROM dataset_version_cases WHERE dataset_version_id = $1 ORDER BY ordinal LIMIT 500`
        : `SELECT id, input, expected_output FROM dataset_cases WHERE dataset_id = $1 ORDER BY id LIMIT 500`,
      [row.dataset_version_id ?? row.dataset_id],
    );

    if (!cases.length) {
      await this.databaseService.rows(
        `UPDATE evaluation_runs
         SET status = 'error', error = 'Dataset is empty', finished_at = now(), lease_until = NULL, lease_token = NULL
         WHERE id = $1 AND lease_token = $2`,
        [run_id, leaseToken],
      );
      return;
    }

    let successes = 0;
    try {
      for (const item of cases) {
        const active = await this.databaseService.one(
          `UPDATE evaluation_runs
           SET lease_until = now() + interval '5 minutes'
           WHERE id = $1 AND lease_token = $2 AND status = 'running' AND lease_until > now()
           RETURNING id`,
          [run_id, leaseToken],
        );
        if (!active) return;

        const prompt = renderPrompt(row.template, item.input);
        const inference = await this.modelInferenceService.infer(
          row.model,
          prompt,
        );
        const passed =
          row.kind === 'exact_match'
            ? normalizedExactMatch(inference.output, item.expected_output)
            : evaluateDeterministic(
                row.kind,
                item.expected_output,
                inference.output,
              );

        const saved = await this.databaseService.rows(
          `INSERT INTO evaluation_results(run_id, case_id, passed, actual_output)
           SELECT $1, $2, $3, $4
           WHERE EXISTS(
             SELECT 1 FROM evaluation_runs
             WHERE id = $1 AND lease_token = $5 AND status = 'running' AND lease_until > now()
           )
           ON CONFLICT(run_id, case_id)
           DO UPDATE SET passed = EXCLUDED.passed, actual_output = EXCLUDED.actual_output
           RETURNING id`,
          [run_id, item.id, passed, inference.output, leaseToken],
        );
        if (!saved.length) return;
        if (passed) successes++;
      }

      const score = successes / cases.length;
      await this.databaseService.rows(
        `UPDATE evaluation_runs
         SET status = $2, score = $3, total_cases = $4, passed_cases = $5, finished_at = now(), lease_until = NULL, lease_token = NULL
         WHERE id = $1 AND status = 'running' AND lease_token = $6`,
        [
          run_id,
          score === 1 ? 'passed' : 'failed',
          score,
          cases.length,
          successes,
          leaseToken,
        ],
      );
    } catch (error) {
      await this.databaseService.rows(
        `UPDATE evaluation_runs
         SET status = 'error', error = $2, finished_at = now(), lease_until = NULL, lease_token = NULL
         WHERE id = $1 AND status = 'running' AND lease_token = $3`,
        [run_id, error instanceof Error ? error.name : 'unknown', leaseToken],
      );
      throw error;
    }
  }
}
