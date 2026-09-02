import { Injectable } from '@nestjs/common';
import { and, count, eq } from 'drizzle-orm';
import { DatabaseService } from '../../../../../database/database.service';
import { model_catalog } from '../../../../../database/schema';
import type { ModelCatalogRepositoryPort } from '../../../application/ports/model-catalog.port';

@Injectable()
export class ModelCatalogDrizzleRepository
  implements ModelCatalogRepositoryPort
{
  constructor(private readonly db: DatabaseService) {}

  async countActiveModels(organizationId: string): Promise<number> {
    const rows = await this.db.orm
      .select({ total: count() })
      .from(model_catalog)
      .where(
        and(
          eq(model_catalog.organization_id, organizationId),
          eq(model_catalog.active, true),
        ),
      );
    return Number(rows[0]?.total ?? 0);
  }
}
