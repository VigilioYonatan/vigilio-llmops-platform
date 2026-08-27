import { Injectable } from '@nestjs/common';
import { and, eq, isNotNull } from 'drizzle-orm';
import { DatabaseService } from '../../../../../database/database.service';
import { mfa_factors } from '../../../../../database/schema';
import type { IdentityRepositoryPort } from '../../../application/ports/identity.port';

@Injectable()
export class IdentityDrizzleRepository implements IdentityRepositoryPort {
  constructor(private readonly db: DatabaseService) {}

  async hasActiveMfa(userId: string): Promise<boolean> {
    const rows = await this.db.orm
      .select({ user_id: mfa_factors.user_id })
      .from(mfa_factors)
      .where(
        and(
          eq(mfa_factors.user_id, userId),
          isNotNull(mfa_factors.activated_at),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }
}
