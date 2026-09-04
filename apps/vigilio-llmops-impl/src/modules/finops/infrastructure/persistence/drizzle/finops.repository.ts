import { Injectable } from '@nestjs/common';
import { and, desc, eq, lte } from 'drizzle-orm';
import { DatabaseService } from '../../../../../database/database.service';
import { price_cards } from '../../../../../database/schema';
import type { FinopsRepositoryPort } from '../../../application/ports/finops.port';

@Injectable()
export class FinopsDrizzleRepository implements FinopsRepositoryPort {
  constructor(private readonly db: DatabaseService) {}

  async findActivePriceCard(
    organizationId: string,
    model: string,
  ): Promise<{
    price_input_per_million: string;
    price_output_per_million: string;
  } | null> {
    const rows = await this.db.orm
      .select({
        price_input_per_million: price_cards.price_input_per_million,
        price_output_per_million: price_cards.price_output_per_million,
      })
      .from(price_cards)
      .where(
        and(
          eq(price_cards.organization_id, organizationId),
          eq(price_cards.model, model),
          lte(price_cards.effective_from, new Date()),
        ),
      )
      .orderBy(desc(price_cards.effective_from))
      .limit(1);
    return rows[0] ?? null;
  }
}
