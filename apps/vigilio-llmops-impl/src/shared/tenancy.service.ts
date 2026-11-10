import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SQL_PORT, type SqlPort } from './ports/sql.port';

export type Role =
  | 'owner'
  | 'admin'
  | 'developer'
  | 'approver'
  | 'analyst'
  | 'viewer';

@Injectable()
export class TenancyService {
  constructor(@Inject(SQL_PORT) private readonly databaseService: SqlPort) {}

  async membership(
    user_id: string,
    organization_id: string,
    allow?: Role[],
  ): Promise<Role> {
    const row = await this.databaseService.one<{ role: Role }>(
      'SELECT role FROM memberships WHERE user_id=$1 AND organization_id=$2',
      [user_id, organization_id],
    );
    if (!row) throw new NotFoundException('Resource not found');
    if (allow && !allow.includes(row.role))
      throw new ForbiddenException('Insufficient role');
    return row.role;
  }

  async workspace(user_id: string, workspace_id: string, allow?: Role[]) {
    const workspace = await this.databaseService.one<{
      id: string;
      organization_id: string;
      name: string;
      slug: string;
    }>('SELECT id,organization_id,name,slug FROM workspaces WHERE id=$1', [
      workspace_id,
    ]);
    if (!workspace) throw new NotFoundException('Workspace not found');
    await this.membership(user_id, workspace.organization_id, allow);
    return workspace;
  }
}
