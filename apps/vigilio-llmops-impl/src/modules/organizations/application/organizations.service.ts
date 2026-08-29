import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../../shared/audit.service';
import { SQL_PORT, type SqlPort } from '../../../shared/ports/sql.port';
import { TenancyService } from '../../../shared/tenancy.service';
import type {
  CreateOrgRequestDto,
  CreateWorkspaceRequestDto,
} from '../presentation/http/dto/organization.dto';

@Injectable()
export class OrganizationsService {
  constructor(
    @Inject(SQL_PORT) private readonly databaseService: SqlPort,
    private readonly tenancyService: TenancyService,
    private readonly auditService: AuditService,
  ) {}

  async create(userId: string, body: CreateOrgRequestDto) {
    const org = await this.databaseService.tx(async (client) => {
      const result = await client.query<{
        id: string;
        slug: string;
        name: string;
      }>(
        'INSERT INTO organizations(name,slug,created_by) VALUES($1,$2,$3) RETURNING id,name,slug',
        [body.name, body.slug, userId],
      );
      const organizationId = result.rows[0]?.id;
      await client.query(
        "INSERT INTO memberships(organization_id,user_id,role) VALUES($1,$2,'owner')",
        [organizationId, userId],
      );
      await client.query(
        "INSERT INTO workspaces(organization_id,slug,name) VALUES($1,'default','Default workspace')",
        [organizationId],
      );
      await client.query(
        'INSERT INTO budget_policies(organization_id,limit_usd) VALUES($1,$2)',
        [organizationId, '10.000000'],
      );
      return result.rows[0]!;
    });
    await this.auditService.write(
      'organization.created',
      userId,
      org.id,
      'organization',
      org.id,
    );
    return org;
  }

  async list(userId: string) {
    return this.databaseService.rows(
      'SELECT o.id,o.name,o.slug,m.role,o.created_at FROM organizations o JOIN memberships m ON m.organization_id=o.id WHERE m.user_id=$1 ORDER BY o.created_at DESC LIMIT 100',
      [userId],
    );
  }

  async get(userId: string, organizationId: string) {
    await this.tenancyService.membership(userId, organizationId);
    const org = await this.databaseService.one(
      'SELECT id,slug,name,created_at FROM organizations WHERE id=$1',
      [organizationId],
    );
    if (!org) throw new NotFoundException();
    return org;
  }

  async listWorkspaces(userId: string, organizationId: string) {
    await this.tenancyService.membership(userId, organizationId);
    return this.databaseService.rows(
      'SELECT id,slug,name,created_at FROM workspaces WHERE organization_id=$1 ORDER BY created_at LIMIT 100',
      [organizationId],
    );
  }

  async createWorkspace(
    userId: string,
    organizationId: string,
    body: CreateWorkspaceRequestDto,
  ) {
    await this.tenancyService.membership(userId, organizationId, [
      'owner',
      'admin',
    ]);
    const row = await this.databaseService.one<{ id: string }>(
      'INSERT INTO workspaces(organization_id,slug,name) VALUES ($1,$2,$3) RETURNING id,organization_id,name,slug',
      [organizationId, body.slug, body.name],
    );
    if (!row) throw new ConflictException('Unable to create workspace');
    await this.auditService.write(
      'workspace.created',
      userId,
      organizationId,
      'workspace',
      String(row.id),
    );
    return row;
  }

  async members(userId: string, organizationId: string) {
    await this.tenancyService.membership(userId, organizationId);
    return this.databaseService.rows(
      'SELECT u.id,u.display_name,u.email,m.role FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.organization_id=$1 ORDER BY m.created_at LIMIT 100',
      [organizationId],
    );
  }

  async addMember(
    actorId: string,
    organizationId: string,
    email: string,
    role: string,
  ) {
    await this.tenancyService.membership(actorId, organizationId, [
      'owner',
      'admin',
    ]);
    const row = await this.databaseService.tx(async (client) => {
      const user = await client.query<{ id: string }>(
        'SELECT id FROM users WHERE email=$1 AND email_verified=true AND disabled_at IS NULL',
        [email],
      );
      if (!user.rowCount)
        throw new NotFoundException('Verified user not found');
      const targetId = user.rows[0]?.id;
      const existing = await client.query(
        'SELECT 1 FROM memberships WHERE organization_id=$1 AND user_id=$2',
        [organizationId, targetId],
      );
      if (existing.rowCount)
        throw new ConflictException(
          'User already belongs to this organization',
        );
      const member = await client.query<{ user_id: string; role: string }>(
        'INSERT INTO memberships(organization_id,user_id,role) VALUES($1,$2,$3) RETURNING user_id,role',
        [organizationId, targetId, role],
      );
      return member.rows[0]!;
    });
    await this.auditService.write(
      'member.added',
      actorId,
      organizationId,
      'user',
      row.user_id,
      {
        role,
      },
    );
    return row;
  }

  async changeMemberRole(
    actorId: string,
    organizationId: string,
    memberId: string,
    role: string,
  ) {
    await this.tenancyService.membership(actorId, organizationId, [
      'owner',
      'admin',
    ]);
    const row = await this.databaseService.one<{
      user_id: string;
      role: string;
    }>(
      "UPDATE memberships SET role=$3 WHERE organization_id=$1 AND user_id=$2 AND role<>'owner' RETURNING user_id,role",
      [organizationId, memberId, role],
    );
    if (!row)
      throw new NotFoundException('Member unavailable or protected owner');
    await this.auditService.write(
      'member.role_changed',
      actorId,
      organizationId,
      'user',
      memberId,
      {
        role,
      },
    );
    return row;
  }

  async removeMember(
    actorId: string,
    organizationId: string,
    memberId: string,
  ) {
    await this.tenancyService.membership(actorId, organizationId, [
      'owner',
      'admin',
    ]);
    const row = await this.databaseService.one<{ user_id: string }>(
      "DELETE FROM memberships WHERE organization_id=$1 AND user_id=$2 AND role<>'owner' RETURNING user_id",
      [organizationId, memberId],
    );
    if (!row)
      throw new NotFoundException('Member unavailable or protected owner');
    await this.auditService.write(
      'member.removed',
      actorId,
      organizationId,
      'user',
      memberId,
    );
    return { removed: true };
  }
}
