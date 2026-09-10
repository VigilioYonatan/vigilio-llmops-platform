import { Inject, Injectable } from '@nestjs/common';
import { SQL_PORT, type SqlPort } from '../../../../../shared/ports/sql.port';
import type {
  PromptAliasRecord,
  PromptRecord,
  PromptsRepository,
  PromptVersionRecord,
} from '../../../application/ports/prompts.port';

@Injectable()
export class PromptsDrizzleRepository implements PromptsRepository {
  constructor(@Inject(SQL_PORT) private readonly sql: SqlPort) {}

  async create(
    orgId: string,
    workspaceId: string,
    name: string,
    description: string | null,
    userId: string,
    appId?: string | null,
  ): Promise<PromptRecord> {
    const row = await this.sql.one<PromptRecord>(
      `INSERT INTO prompts(organization_id, workspace_id, application_id, name, description, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, organization_id, workspace_id, application_id, name, description, created_by, created_at`,
      [orgId, workspaceId, appId ?? null, name, description, userId],
    );
    return row!;
  }

  async list(
    workspaceId: string,
  ): Promise<Array<PromptRecord & { latest_version: number }>> {
    return this.sql.rows<PromptRecord & { latest_version: number }>(
      `SELECT p.id, p.organization_id, p.workspace_id, p.application_id, p.name, p.description, p.created_by, p.created_at,
              COALESCE(MAX(v.version), 0)::int AS latest_version
       FROM prompts p
       LEFT JOIN prompt_versions v ON v.prompt_id = p.id
       WHERE p.workspace_id = $1
       GROUP BY p.id
       ORDER BY p.created_at DESC
       LIMIT 100`,
      [workspaceId],
    );
  }

  async listByApp(appId: string): Promise<PromptRecord[]> {
    return this.sql.rows<PromptRecord>(
      `SELECT id, organization_id, workspace_id, application_id, name, description, created_by, created_at
       FROM prompts
       WHERE application_id = $1
       ORDER BY created_at DESC
       LIMIT 200`,
      [appId],
    );
  }

  async findById(id: string): Promise<PromptRecord | null> {
    const row = await this.sql.one<PromptRecord>(
      `SELECT id, organization_id, workspace_id, application_id, name, description, created_by, created_at
       FROM prompts
       WHERE id = $1`,
      [id],
    );
    return row ?? null;
  }

  async findApp(id: string): Promise<{
    id: string;
    organization_id: string;
    workspace_id: string;
  } | null> {
    const row = await this.sql.one<{
      id: string;
      organization_id: string;
      workspace_id: string;
    }>(
      `SELECT id, organization_id, workspace_id
       FROM applications
       WHERE id = $1 AND archived_at IS NULL`,
      [id],
    );
    return row ?? null;
  }

  async listVersions(promptId: string): Promise<PromptVersionRecord[]> {
    return this.sql.rows<PromptVersionRecord>(
      `SELECT id, prompt_id, version, template, model, parameters, sha256, created_by, created_at
       FROM prompt_versions
       WHERE prompt_id = $1
       ORDER BY version DESC
       LIMIT 100`,
      [promptId],
    );
  }

  async findVersion(
    promptId: string,
    versionId: string,
  ): Promise<PromptVersionRecord | null> {
    const row = await this.sql.one<PromptVersionRecord>(
      `SELECT id, prompt_id, version, template, model, parameters, sha256, created_by, created_at
       FROM prompt_versions
       WHERE id = $1 AND prompt_id = $2`,
      [versionId, promptId],
    );
    return row ?? null;
  }

  async findVersions(
    promptId: string,
    versionIds: string[],
  ): Promise<PromptVersionRecord[]> {
    return this.sql.rows<PromptVersionRecord>(
      `SELECT id, prompt_id, version, template, model, parameters, sha256, created_by, created_at
       FROM prompt_versions
       WHERE prompt_id = $1 AND id = ANY($2::uuid[])`,
      [promptId, versionIds],
    );
  }

  async createVersion(
    promptId: string,
    template: string,
    model: string,
    parameters: Record<string, unknown>,
    sha256: string,
    userId: string,
  ): Promise<PromptVersionRecord> {
    return this.sql.tx(async (client) => {
      await client.query('SELECT id FROM prompts WHERE id = $1 FOR UPDATE', [
        promptId,
      ]);
      const version = await client.query<{ next: number }>(
        'SELECT COALESCE(MAX(version), 0)::int + 1 AS next FROM prompt_versions WHERE prompt_id = $1',
        [promptId],
      );
      const created = await client.query<PromptVersionRecord>(
        `INSERT INTO prompt_versions(prompt_id, version, template, model, parameters, sha256, created_by)
         VALUES($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, prompt_id, version, template, model, parameters, sha256, created_by, created_at`,
        [
          promptId,
          version.rows[0]?.next,
          template,
          model,
          JSON.stringify(parameters),
          sha256,
          userId,
        ],
      );
      return created.rows[0]!;
    });
  }

  async findActiveRelease(
    promptVersionId: string,
    workspaceId: string,
  ): Promise<{ id: string } | null> {
    const row = await this.sql.one<{ id: string }>(
      `SELECT l.id
       FROM releases l
       WHERE l.prompt_version_id = $1 AND l.workspace_id = $2 AND l.status = 'active'`,
      [promptVersionId, workspaceId],
    );
    return row ?? null;
  }

  async upsertAlias(
    promptId: string,
    environment: string,
    promptVersionId: string,
    userId: string,
  ): Promise<PromptAliasRecord> {
    const row = await this.sql.one<PromptAliasRecord>(
      `INSERT INTO prompt_aliases(prompt_id, environment, prompt_version_id, assigned_by)
       VALUES($1, $2, $3, $4)
       ON CONFLICT(prompt_id, environment)
       DO UPDATE SET prompt_version_id = EXCLUDED.prompt_version_id,
                     assigned_by = EXCLUDED.assigned_by,
                     updated_at = now()
       RETURNING prompt_id, environment, prompt_version_id, assigned_by, updated_at`,
      [promptId, environment, promptVersionId, userId],
    );
    return row!;
  }

  async listAliases(promptId: string): Promise<PromptAliasRecord[]> {
    return this.sql.rows<PromptAliasRecord>(
      `SELECT prompt_id, environment, prompt_version_id, assigned_by, updated_at
       FROM prompt_aliases
       WHERE prompt_id = $1
       ORDER BY environment`,
      [promptId],
    );
  }
}
