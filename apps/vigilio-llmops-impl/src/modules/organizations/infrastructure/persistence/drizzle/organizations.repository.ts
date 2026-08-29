import { Injectable } from '@nestjs/common';
import { count, eq } from 'drizzle-orm';
import { DatabaseService } from '../../../../../database/database.service';
import { memberships } from '../../../../../database/schema';
import type { OrganizationsRepositoryPort } from '../../../application/ports/organizations.port';

@Injectable()
export class OrganizationsDrizzleRepository
  implements OrganizationsRepositoryPort
{
  constructor(private readonly db: DatabaseService) {}

  async countUserOrganizations(userId: string): Promise<number> {
    const rows = await this.db.orm
      .select({ total: count() })
      .from(memberships)
      .where(eq(memberships.user_id, userId));
    return Number(rows[0]?.total ?? 0);
  }
}
