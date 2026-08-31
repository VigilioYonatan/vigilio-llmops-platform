import { Injectable } from '@nestjs/common';
import { and, count, eq, isNull } from 'drizzle-orm';
import { DatabaseService } from '../../../../../database/database.service';
import { application_keys } from '../../../../../database/schema';
import type { ApplicationsRepositoryPort } from '../../../application/ports/applications.port';

@Injectable()
export class ApplicationsDrizzleRepository
  implements ApplicationsRepositoryPort
{
  constructor(private readonly db: DatabaseService) {}

  async countActiveKeys(applicationId: string): Promise<number> {
    const rows = await this.db.orm
      .select({ total: count() })
      .from(application_keys)
      .where(
        and(
          eq(application_keys.application_id, applicationId),
          isNull(application_keys.revoked_at),
        ),
      );
    return Number(rows[0]?.total ?? 0);
  }
}
