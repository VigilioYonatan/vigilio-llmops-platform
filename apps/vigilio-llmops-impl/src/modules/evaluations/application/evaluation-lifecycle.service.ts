import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../../shared/audit.service';
import { SQL_PORT, type SqlPort } from '../../../shared/ports/sql.port';
import { TenancyService } from '../../../shared/tenancy.service';
import { calibrationAgreement } from '../domain/evaluator';
import type {
  AnnotationRequestDto,
  CalibrationRequestDto,
  ComparisonRequestDto,
  CreateEvaluatorRequestDto,
  EvaluatorVersionRequestDto,
} from '../presentation/http/dto/evaluation.dto';

@Injectable()
export class EvaluationLifecycleService {
  constructor(
    @Inject(SQL_PORT) private readonly db: SqlPort,
    private readonly tenancy: TenancyService,
    private readonly audit: AuditService,
  ) {}

  async createEvaluator(user: string, b: CreateEvaluatorRequestDto) {
    const ws = await this.tenancy.workspace(user, b.workspace_id, [
      'owner',
      'admin',
      'developer',
    ]);
    return this.db.one(
      'INSERT INTO evaluators(organization_id,workspace_id,name,kind,created_by) VALUES($1,$2,$3,$4,$5) RETURNING id,name,kind,created_at',
      [ws.organization_id, b.workspace_id, b.name, b.kind, user],
    );
  }

  async evaluators(user: string, workspace: string) {
    await this.tenancy.workspace(user, workspace);
    return this.db.rows(
      'SELECT id,name,kind,created_at FROM evaluators WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 200',
      [workspace],
    );
  }

  private async evaluator(
    user: string,
    id: string,
    roles?: Array<'owner' | 'admin' | 'developer'>,
  ) {
    const row = await this.db.one<{
      id: string;
      organization_id: string;
      kind: 'exact_match' | 'contains' | 'regex';
    }>('SELECT id,organization_id,kind FROM evaluators WHERE id=$1', [id]);
    if (!row) throw new NotFoundException('Evaluator not found');
    await this.tenancy.membership(user, row.organization_id, roles);
    return row;
  }

  async version(user: string, id: string, b: EvaluatorVersionRequestDto) {
    await this.evaluator(user, id, ['owner', 'admin', 'developer']);
    return this.db.tx(async (client) => {
      await client.query('SELECT id FROM evaluators WHERE id=$1 FOR UPDATE', [
        id,
      ]);
      const v = await client.query<{ version: number }>(
        'SELECT COALESCE(MAX(version),0)::int+1 AS version FROM evaluator_versions WHERE evaluator_id=$1',
        [id],
      );
      const digest = createHash('sha256')
        .update(JSON.stringify(b.rubric))
        .digest('hex');
      const inserted = await client.query(
        'INSERT INTO evaluator_versions(evaluator_id,version,rubric,sha256,created_by) VALUES($1,$2,$3,$4,$5) RETURNING id,version,sha256',
        [id, v.rows[0]?.version, b.rubric, digest, user],
      );
      return inserted.rows[0]!;
    });
  }

  async versions(user: string, id: string) {
    await this.evaluator(user, id);
    return this.db.rows(
      'SELECT id,version,rubric,sha256,created_at FROM evaluator_versions WHERE evaluator_id=$1 ORDER BY version DESC LIMIT 100',
      [id],
    );
  }

  async calibrate(user: string, id: string, b: CalibrationRequestDto) {
    const e = await this.evaluator(user, id, ['owner', 'admin', 'developer']);
    const result = calibrationAgreement(e.kind, b.labels);
    await this.audit.write(
      'evaluator.calibrated',
      user,
      e.organization_id,
      'evaluator',
      id,
      result,
    );
    return {
      ...result,
      kind: e.kind,
      calibrated_against: 'human_labels_provided',
      llm_judge: false,
    };
  }

  private async run(
    user: string,
    id: string,
    roles?: Array<'owner' | 'admin' | 'developer' | 'approver' | 'analyst'>,
  ) {
    const row = await this.db.one<{
      id: string;
      organization_id: string;
      workspace_id: string;
      dataset_id: string;
      status: string;
      score: string | null;
      passed_cases: number;
      total_cases: number;
      created_by: string;
    }>(
      'SELECT id,organization_id,workspace_id,dataset_id,status,score,passed_cases,total_cases,created_by FROM evaluation_runs WHERE id=$1',
      [id],
    );
    if (!row) throw new NotFoundException('Evaluation run not found');
    await this.tenancy.membership(user, row.organization_id, roles);
    return row;
  }

  async cancel(user: string, id: string) {
    const r = await this.run(user, id, ['owner', 'admin', 'developer']);
    const updated = await this.db.one(
      "UPDATE evaluation_runs SET status='cancelled',finished_at=now(),lease_token=NULL,lease_until=NULL WHERE id=$1 AND status IN ('queued','running') RETURNING id,status",
      [id],
    );
    if (!updated) throw new ConflictException('Run no longer cancellable');
    await this.audit.write(
      'evaluation.cancelled',
      user,
      r.organization_id,
      'evaluation_run',
      id,
    );
    return updated;
  }

  async cases(user: string, id: string) {
    await this.run(user, id);
    return this.db.rows(
      'SELECT case_id,passed,notes FROM evaluation_results WHERE run_id=$1 ORDER BY created_at LIMIT 1000',
      [id],
    );
  }

  async metrics(user: string, id: string) {
    const r = await this.run(user, id);
    return {
      run_id: id,
      status: r.status,
      score: r.score,
      total: r.total_cases,
      passed: r.passed_cases,
      failed: r.total_cases - r.passed_cases,
      scoring: 'exact_match',
    };
  }

  async compare(user: string, b: ComparisonRequestDto) {
    const baseline = await this.run(user, b.baseline_run_id);
    const candidate = await this.run(user, b.candidate_run_id);
    if (candidate.workspace_id !== baseline.workspace_id)
      throw new NotFoundException('Runs in different workspaces');
    if (
      !['passed', 'failed'].includes(baseline.status) ||
      !['passed', 'failed'].includes(candidate.status)
    ) {
      throw new ConflictException('Both runs must be complete');
    }
    const result = await this.db.one(
      'INSERT INTO evaluation_comparisons(organization_id,workspace_id,baseline_run_id,candidate_run_id,baseline_score,candidate_score,score_delta,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,baseline_score,candidate_score,score_delta,created_at',
      [
        baseline.organization_id,
        baseline.workspace_id,
        baseline.id,
        candidate.id,
        baseline.score,
        candidate.score,
        Number(candidate.score) - Number(baseline.score),
        user,
      ],
    );
    return result;
  }

  async comparison(user: string, id: string) {
    const r = await this.db.one<{ organization_id: string }>(
      'SELECT id,organization_id,baseline_run_id,candidate_run_id,baseline_score,candidate_score,score_delta,created_at FROM evaluation_comparisons WHERE id=$1',
      [id],
    );
    if (!r) throw new NotFoundException('Comparison not found');
    await this.tenancy.membership(user, r.organization_id);
    return r;
  }

  async comparisons(user: string, workspaceId: string) {
    await this.tenancy.workspace(user, workspaceId);
    return this.db.rows(
      'SELECT id,baseline_run_id,candidate_run_id,baseline_score,candidate_score,score_delta,created_at FROM evaluation_comparisons WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 100',
      [workspaceId],
    );
  }

  async annotate(user: string, id: string, b: AnnotationRequestDto) {
    const r = await this.run(user, id, [
      'owner',
      'admin',
      'developer',
      'analyst',
      'approver',
    ]);
    const valid = await this.db.one(
      'SELECT id FROM dataset_cases WHERE id=$1 AND dataset_id=$2',
      [b.case_id, r.dataset_id],
    );
    if (!valid)
      throw new BadRequestException('Case does not belong to run dataset');
    return this.db.one(
      'INSERT INTO evaluation_annotations(run_id,case_id,score,notes,author_id) VALUES($1,$2,$3,$4,$5) RETURNING id,case_id,score,notes,created_at',
      [id, b.case_id, b.score, b.notes, user],
    );
  }

  async annotations(user: string, id: string) {
    await this.run(user, id);
    return this.db.rows(
      'SELECT id,case_id,score,notes,author_id,created_at FROM evaluation_annotations WHERE run_id=$1 ORDER BY created_at LIMIT 200',
      [id],
    );
  }

  async export(user: string, id: string) {
    const r = await this.run(user, id, ['owner', 'admin', 'approver']);
    const cases = await this.cases(user, id);
    await this.audit.write(
      'evaluation.exported',
      user,
      r.organization_id,
      'evaluation_run',
      id,
    );
    return {
      format: 'json',
      run_id: id,
      metrics: await this.metrics(user, id),
      cases,
      content_capture: false,
    };
  }
}
