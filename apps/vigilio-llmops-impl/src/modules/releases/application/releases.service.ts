import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../../shared/audit.service';
import { Principal } from '../../../shared/http/principal';
import { SQL_PORT, type SqlPort } from '../../../shared/ports/sql.port';
import { TenancyService } from '../../../shared/tenancy.service';
import { canApprove, isPromotionEligible } from '../domain/release-policy';
import type { CreateReleaseRequestDto } from '../presentation/http/dto/release.dto';

@Injectable()
export class ReleasesService {
  constructor(
    @Inject(SQL_PORT) private readonly databaseService: SqlPort,
    private readonly tenancyService: TenancyService,
    private readonly auditService: AuditService,
  ) {}

  async createPolicy(
    user_id: string,
    workspace_id: string,
    name: string,
    minimum_score: number,
  ) {
    const ws = await this.tenancyService.workspace(user_id, workspace_id, [
      'owner',
      'admin',
    ]);
    return this.databaseService.one(
      'INSERT INTO quality_policies(organization_id,workspace_id,name,minimum_score,created_by) VALUES($1,$2,$3,$4,$5) RETURNING id,name,minimum_score',
      [ws.organization_id, workspace_id, name, minimum_score, user_id],
    );
  }

  async policies(user_id: string, workspace_id: string) {
    await this.tenancyService.workspace(user_id, workspace_id);
    return this.databaseService.rows(
      'SELECT id,name,minimum_score,created_at FROM quality_policies WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 100',
      [workspace_id],
    );
  }

  async create(user_id: string, body: CreateReleaseRequestDto) {
    const ws = await this.tenancyService.workspace(user_id, body.workspace_id, [
      'owner',
      'admin',
      'developer',
    ]);
    const valid = await this.databaseService.one<{ prompt_id: string }>(
      `SELECT p.id AS prompt_id
       FROM evaluation_runs r
       JOIN prompt_versions v ON v.id = r.prompt_version_id
       JOIN prompts p ON p.id = v.prompt_id
       JOIN quality_policies q ON q.id = $4
       WHERE r.id = $1 AND r.prompt_version_id = $2 AND r.workspace_id = $3 AND p.workspace_id = $3 AND q.workspace_id = $3`,
      [
        body.evaluation_run_id,
        body.prompt_version_id,
        body.workspace_id,
        body.policy_id,
      ],
    );
    if (!valid) {
      throw new BadRequestException(
        'Release dependencies must belong to the same workspace and evaluation',
      );
    }

    const release = await this.databaseService.one<{
      id: string;
      status: string;
      created_at: Date;
    }>(
      `INSERT INTO releases(organization_id, workspace_id, prompt_id, prompt_version_id, evaluation_run_id, policy_id, environment, created_by, policy_threshold_snapshot)
       SELECT $1, $2, $3, $4, $5, $6, $7, $8, minimum_score
       FROM quality_policies WHERE id = $6 AND workspace_id = $2
       RETURNING id, status, created_at`,
      [
        ws.organization_id,
        body.workspace_id,
        valid.prompt_id,
        body.prompt_version_id,
        body.evaluation_run_id,
        body.policy_id,
        body.environment,
        user_id,
      ],
    );

    await this.databaseService.rows(
      'INSERT INTO release_workflow_events(release_id, action, actor_id, detail) VALUES($1, $2, $3, $4)',
      [
        release?.id,
        'created',
        user_id,
        JSON.stringify({ environment: body.environment }),
      ],
    );

    return release;
  }

  async list(user_id: string, workspace_id: string) {
    await this.tenancyService.workspace(user_id, workspace_id);
    return this.databaseService.rows(
      `SELECT r.id, r.status, r.prompt_id, r.prompt_version_id, r.evaluation_run_id, r.policy_id, r.environment,
              r.created_by, r.approved_by, r.created_at, p.name AS prompt_name, pv.version AS prompt_version
       FROM releases r
       LEFT JOIN prompts p ON p.id = r.prompt_id
       LEFT JOIN prompt_versions pv ON pv.id = r.prompt_version_id
       WHERE r.workspace_id = $1
       ORDER BY r.created_at DESC
       LIMIT 100`,
      [workspace_id],
    );
  }

  async get(user_id: string, id: string) {
    const row = await this.databaseService.one<{
      id: string;
      organization_id: string;
      workspace_id: string;
      prompt_id: string;
      prompt_version_id: string;
      environment: string;
      status: string;
      created_by: string;
      approved_by: string | null;
    }>(
      'SELECT id, organization_id, workspace_id, prompt_id, prompt_version_id, environment, status, created_by, approved_by FROM releases WHERE id=$1',
      [id],
    );
    if (!row) throw new NotFoundException('Release not found');
    await this.tenancyService.membership(user_id, row.organization_id);
    return row;
  }

  async verify(user_id: string, id: string) {
    const release = await this.get(user_id, id);
    await this.tenancyService.membership(user_id, release.organization_id, [
      'owner',
      'admin',
      'developer',
      'approver',
    ]);
    const result = await this.databaseService.tx(async (client) => {
      const rows = await client.query<{
        status: string;
        score: string | null;
        minimum_score: string;
        run_status: string;
      }>(
        `SELECT l.status, r.score, l.policy_threshold_snapshot AS minimum_score, r.status AS run_status
         FROM releases l
         JOIN evaluation_runs r ON r.id = l.evaluation_run_id
         JOIN quality_policies q ON q.id = l.policy_id
         WHERE l.id = $1 FOR UPDATE OF l`,
        [id],
      );
      const row = rows.rows[0];
      if (!row) throw new NotFoundException('Release or run not found');
      if (row.status !== 'draft')
        throw new ConflictException('Release is not a draft');
      const passed = isPromotionEligible(
        Number(row.score),
        Number(row.minimum_score),
        row.run_status,
      );
      const targetStatus = passed ? 'verified' : 'rejected';
      await client.query('UPDATE releases SET status=$2 WHERE id=$1', [
        id,
        targetStatus,
      ]);
      await client.query(
        'INSERT INTO release_workflow_events(release_id, action, actor_id, detail) VALUES($1, $2, $3, $4)',
        [
          id,
          targetStatus,
          user_id,
          JSON.stringify({
            verified: passed,
            score: row.score,
            required: row.minimum_score,
          }),
        ],
      );
      return {
        verified: passed,
        score: row.score,
        required: row.minimum_score,
      };
    });
    await this.auditService.write(
      'release.verified',
      user_id,
      release.organization_id,
      'release',
      id,
      {
        verified: result.verified,
      },
    );
    return result;
  }

  async approve(principal: Principal, id: string) {
    const release = await this.get(principal.user_id, id);
    await this.tenancyService.membership(
      principal.user_id,
      release.organization_id,
      ['owner', 'approver'],
    );
    if (
      !canApprove(
        release.created_by,
        principal.user_id,
        principal.mfa_verified_at,
      )
    ) {
      throw new ForbiddenException('Separate approver and recent MFA required');
    }
    const rows = await this.databaseService.rows(
      `UPDATE releases SET status='approved', approved_by=$2, approved_at=now()
       WHERE id=$1 AND status IN ('verified', 'approval_requested')
       RETURNING id`,
      [id, principal.user_id],
    );
    if (!rows.length) {
      throw new ConflictException(
        'Release must be verified or have approval requested',
      );
    }
    await this.databaseService.rows(
      'INSERT INTO release_workflow_events(release_id, action, actor_id) VALUES($1, $2, $3)',
      [id, 'approved', principal.user_id],
    );
    await this.auditService.write(
      'release.approved',
      principal.user_id,
      release.organization_id,
      'release',
      id,
    );
    return { approved: true };
  }

  async activate(principal: Principal, id: string) {
    const release = await this.get(principal.user_id, id);
    await this.tenancyService.membership(
      principal.user_id,
      release.organization_id,
      ['owner', 'approver'],
    );
    if (
      !principal.mfa_verified_at ||
      Date.now() - new Date(principal.mfa_verified_at).getTime() > 300000
    ) {
      throw new ForbiddenException('Recent MFA required');
    }
    await this.databaseService.tx(async (client) => {
      await client.query('SELECT id FROM workspaces WHERE id=$1 FOR UPDATE', [
        release.workspace_id,
      ]);
      const rows = await client.query<{
        status: string;
        prompt_id: string;
        prompt_version_id: string;
        environment: string;
      }>(
        'SELECT status, prompt_id, prompt_version_id, environment FROM releases WHERE id=$1 AND workspace_id=$2 FOR UPDATE',
        [id, release.workspace_id],
      );
      if (rows.rows[0]?.status !== 'approved') {
        throw new ConflictException(
          'Release must be approved prior to activation',
        );
      }
      const env = rows.rows[0]?.environment;
      const promptId = rows.rows[0]?.prompt_id;
      const promptVersionId = rows.rows[0]?.prompt_version_id;

      // Deactivate any currently active release for this specific (workspace, prompt, environment)
      await client.query(
        "UPDATE releases SET status='approved' WHERE workspace_id=$1 AND prompt_id=$2 AND environment=$3 AND status='active'",
        [release.workspace_id, promptId, env],
      );
      await client.query("UPDATE releases SET status='active' WHERE id=$1", [
        id,
      ]);

      await client.query(
        `INSERT INTO prompt_aliases(prompt_id, environment, prompt_version_id, assigned_by)
         VALUES($1, $2, $3, $4)
         ON CONFLICT(prompt_id, environment)
         DO UPDATE SET prompt_version_id = EXCLUDED.prompt_version_id,
                       assigned_by = EXCLUDED.assigned_by,
                       updated_at = now()`,
        [promptId, env, promptVersionId, principal.user_id],
      );

      await client.query(
        'INSERT INTO release_workflow_events(release_id, action, actor_id, detail) VALUES($1, $2, $3, $4)',
        [
          id,
          'activated',
          principal.user_id,
          JSON.stringify({ environment: env }),
        ],
      );
      await client.query(
        "INSERT INTO outbox_events(topic, payload) VALUES('release.activated', $1)",
        [JSON.stringify({ release_id: id, environment: env })],
      );
    });
    await this.auditService.write(
      'release.activated',
      principal.user_id,
      release.organization_id,
      'release',
      id,
    );
    return { active: true };
  }

  async rollback(principal: Principal, id: string) {
    const release = await this.get(principal.user_id, id);
    await this.tenancyService.membership(
      principal.user_id,
      release.organization_id,
      ['owner', 'approver'],
    );
    if (
      !principal.mfa_verified_at ||
      Date.now() - new Date(principal.mfa_verified_at).getTime() > 300000
    ) {
      throw new ForbiddenException('Recent MFA required');
    }
    const result = await this.databaseService.tx(async (client) => {
      await client.query('SELECT id FROM workspaces WHERE id=$1 FOR UPDATE', [
        release.workspace_id,
      ]);
      const current = await client.query<{
        id: string;
        prompt_id: string;
        environment: string;
      }>(
        "SELECT id, prompt_id, environment FROM releases WHERE id=$1 AND status='active' FOR UPDATE",
        [id],
      );
      if (!current.rowCount)
        throw new ConflictException('Not an active release');
      const env = current.rows[0]?.environment;
      const promptId = current.rows[0]?.prompt_id;

      const previous = await client.query<{
        id: string;
        prompt_version_id: string;
      }>(
        `SELECT id, prompt_version_id FROM releases
         WHERE workspace_id=$1 AND prompt_id=$2 AND environment=$3 AND status='approved' AND id<>$4
         ORDER BY approved_at DESC LIMIT 1 FOR UPDATE`,
        [release.workspace_id, promptId, env, id],
      );

      await client.query(
        "UPDATE releases SET status='rolled_back' WHERE id=$1",
        [id],
      );

      if (previous.rowCount) {
        await client.query("UPDATE releases SET status='active' WHERE id=$1", [
          previous.rows[0]?.id,
        ]);
        await client.query(
          `INSERT INTO prompt_aliases(prompt_id, environment, prompt_version_id, assigned_by)
           VALUES($1, $2, $3, $4)
           ON CONFLICT(prompt_id, environment)
           DO UPDATE SET prompt_version_id = EXCLUDED.prompt_version_id,
                         assigned_by = EXCLUDED.assigned_by,
                         updated_at = now()`,
          [
            promptId,
            env,
            previous.rows[0]?.prompt_version_id,
            principal.user_id,
          ],
        );
      } else {
        await client.query(
          'DELETE FROM prompt_aliases WHERE prompt_id=$1 AND environment=$2',
          [promptId, env],
        );
      }

      await client.query(
        'INSERT INTO release_workflow_events(release_id, action, actor_id, detail) VALUES($1, $2, $3, $4)',
        [
          id,
          'rolled_back',
          principal.user_id,
          JSON.stringify({ restored_release_id: previous.rows[0]?.id ?? null }),
        ],
      );
      await client.query(
        "INSERT INTO outbox_events(topic, payload) VALUES('release.rolled_back', $1)",
        [
          JSON.stringify({
            release_id: id,
            restored: previous.rows[0]?.id ?? null,
          }),
        ],
      );
      return {
        rolled_back: true,
        restored_release_id: previous.rows[0]?.id ?? null,
      };
    });
    await this.auditService.write(
      'release.rolled_back',
      principal.user_id,
      release.organization_id,
      'release',
      id,
    );
    return result;
  }
}
