import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../../shared/audit.service';
import { encryptSecret, randomToken, sha256 } from '../../../shared/crypto';
import { SQL_PORT, type SqlPort } from '../../../shared/ports/sql.port';
import { TenancyService } from '../../../shared/tenancy.service';
import { ORG_ROLE_PERMISSIONS } from '../domain/org-permissions';
import type { InvitationDto } from '../presentation/http/dto/organization.dto';

@Injectable()
export class WorkspaceManagementService {
  constructor(
    @Inject(SQL_PORT) private readonly db: SqlPort,
    private readonly tenancy: TenancyService,
    private readonly audit: AuditService,
  ) {}

  async patchOrg(user: string, id: string, name: string) {
    await this.tenancy.membership(user, id, ['owner', 'admin']);
    const row = await this.db.one(
      'UPDATE organizations SET name=$2 WHERE id=$1 RETURNING id,slug,name',
      [id, name],
    );
    if (!row) throw new NotFoundException();
    await this.audit.write(
      'organization.updated',
      user,
      id,
      'organization',
      id,
    );
    return row;
  }

  async roles(user: string, org: string) {
    await this.tenancy.membership(user, org);
    return Object.entries(ORG_ROLE_PERMISSIONS).map(([role, permissions]) => ({
      role,
      permissions,
    }));
  }

  async listInvitations(user: string, org: string) {
    await this.tenancy.membership(user, org, ['owner', 'admin']);
    return this.db.rows(
      'SELECT id,email,role,expires_at,accepted_at,revoked_at,created_at FROM organization_invitations WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 100',
      [org],
    );
  }

  async invite(user: string, org: string, b: InvitationDto) {
    await this.tenancy.membership(user, org, ['owner', 'admin']);
    const token = randomToken();
    const invited = await this.db.tx(async (client) => {
      const created = await client.query<{
        id: string;
        email: string;
        role: string;
        expires_at: Date;
      }>(
        "INSERT INTO organization_invitations(organization_id,email,role,token_hash,expires_at,invited_by) VALUES($1,$2,$3,$4,now()+interval '72 hours',$5) RETURNING id,email,role,expires_at",
        [org, b.email, b.role, sha256(token), user],
      );
      await client.query(
        "INSERT INTO outbox_events(topic,payload) VALUES('email.invite',$1)",
        [
          JSON.stringify({
            email: b.email,
            token_encrypted: encryptSecret(token),
            invitation_id: created.rows[0]?.id,
          }),
        ],
      );
      return created.rows[0]!;
    });
    await this.audit.write(
      'organization.invitation_created',
      user,
      org,
      'invitation',
      invited.id,
    );
    return {
      id: invited.id,
      email: invited.email,
      role: invited.role,
      expires_at: invited.expires_at,
    };
  }

  async accept(user: string, id: string, token: string) {
    const profile = await this.db.one<{
      email: string;
      email_verified: boolean;
    }>(
      'SELECT email,email_verified FROM users WHERE id=$1 AND disabled_at IS NULL',
      [user],
    );
    if (!profile || !profile.email_verified) {
      throw new ForbiddenException('Verified email required');
    }
    const result = await this.db.tx(async (client) => {
      const invite = await client.query<{
        organization_id: string;
        email: string;
        role: string;
      }>(
        'SELECT organization_id,email,role FROM organization_invitations WHERE id=$1 AND token_hash=$2 AND revoked_at IS NULL AND accepted_at IS NULL AND expires_at>now() FOR UPDATE',
        [id, sha256(token)],
      );
      if (!invite.rowCount)
        throw new NotFoundException('Invitation unavailable');
      const row = invite.rows[0]!;
      if (profile.email !== row.email) {
        throw new ForbiddenException('Invitation belongs to another email');
      }
      const exists = await client.query(
        'SELECT 1 FROM memberships WHERE organization_id=$1 AND user_id=$2',
        [row.organization_id, user],
      );
      if (exists.rowCount) throw new ConflictException('Already a member');
      await client.query(
        'INSERT INTO memberships(organization_id,user_id,role) VALUES($1,$2,$3)',
        [row.organization_id, user, row.role],
      );
      await client.query(
        'UPDATE organization_invitations SET accepted_at=now() WHERE id=$1',
        [id],
      );
      return {
        accepted: true,
        organization_id: row.organization_id,
        role: row.role,
      };
    });
    await this.audit.write(
      'organization.invitation_accepted',
      user,
      result.organization_id,
      'invitation',
      id,
    );
    return result;
  }

  async revoke(user: string, org: string, id: string) {
    await this.tenancy.membership(user, org, ['owner', 'admin']);
    const row = await this.db.one(
      'UPDATE organization_invitations SET revoked_at=now() WHERE id=$1 AND organization_id=$2 AND accepted_at IS NULL AND revoked_at IS NULL RETURNING id',
      [id, org],
    );
    if (!row) throw new NotFoundException();
    return { revoked: true };
  }

  async workspace(user: string, id: string, name: string) {
    const ws = await this.tenancy.workspace(user, id, ['owner', 'admin']);
    await this.audit.write(
      'workspace.updated',
      user,
      ws.organization_id,
      'workspace',
      id,
    );
    return this.db.one(
      'UPDATE workspaces SET name=$2 WHERE id=$1 RETURNING id,name,slug,organization_id',
      [id, name],
    );
  }

  async workspaceMembers(user: string, id: string) {
    const ws = await this.tenancy.workspace(user, id);
    return {
      workspace_id: id,
      membership_scope: 'organization',
      members: await this.db.rows(
        'SELECT m.user_id,m.role,u.display_name,u.email FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.organization_id=$1 ORDER BY m.created_at LIMIT 100',
        [ws.organization_id],
      ),
    };
  }
}
