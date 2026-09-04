import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import {
  CurrentPrincipal,
  type Principal,
} from '../../../../shared/http/principal';
import { ZodPipe } from '../../../../shared/http/zod.pipe';
import { BudgetService } from '../../application/budget.service';
import { FinopsAnalyticsService } from '../../application/finops-analytics.service';
import {
  budgetCreateSchema,
  budgetPatchSchema,
  budgetSimulateSchema,
  costQuerySchema,
  priceCardSchema,
  upsertBudgetSchema,
} from './dto/budget.dto';

const uuid = z.uuid();
const reconcileBodySchema = z.object({ organization_id: uuid }).strict();

@Controller('api/v1/budgets')
export class BudgetsController {
  constructor(private readonly budgetService: BudgetService) {}

  @Post()
  upsert(
    @CurrentPrincipal() principal: Principal,
    @Body(new ZodPipe(upsertBudgetSchema)) body: z.infer<
      typeof upsertBudgetSchema
    >,
  ) {
    return this.budgetService.upsert(
      principal.user_id,
      body.organization_id,
      body.limit_usd,
    );
  }

  @Get()
  get(
    @CurrentPrincipal() principal: Principal,
    @Query('organization_id', new ZodPipe(uuid)) organizationId: string,
  ) {
    return this.budgetService.get(principal.user_id, organizationId);
  }
}

@Controller('api/v1/budget-policies')
export class BudgetPoliciesController {
  constructor(private readonly service: FinopsAnalyticsService) {}

  @Post()
  create(
    @CurrentPrincipal() p: Principal,
    @Body(new ZodPipe(budgetCreateSchema)) b: z.infer<
      typeof budgetCreateSchema
    >,
  ) {
    return this.service.create(p.user_id, b.organization_id, b.limit_usd);
  }

  @Get()
  list(
    @CurrentPrincipal() p: Principal,
    @Query('organization_id', new ZodPipe(uuid)) org: string,
  ) {
    return this.service.list(p.user_id, org);
  }

  @Patch(':budget_id')
  patch(
    @CurrentPrincipal() p: Principal,
    @Param('budget_id', new ZodPipe(uuid)) id: string,
    @Body(new ZodPipe(budgetPatchSchema)) b: z.infer<typeof budgetPatchSchema>,
  ) {
    return this.service.patch(p.user_id, id, b.limit_usd);
  }

  @Post(':budget_id/simulate')
  simulate(
    @CurrentPrincipal() p: Principal,
    @Param('budget_id', new ZodPipe(uuid)) id: string,
    @Body(new ZodPipe(budgetSimulateSchema)) b: z.infer<
      typeof budgetSimulateSchema
    >,
  ) {
    return this.service.simulate(p.user_id, id, b.estimated_usd);
  }
}

@Controller('api/v1/costs')
export class CostsController {
  constructor(private readonly service: FinopsAnalyticsService) {}

  private query(organizationId: string, from?: string, to?: string) {
    return costQuerySchema.parse({ organization_id: organizationId, from, to });
  }

  @Get('overview')
  overview(
    @CurrentPrincipal() p: Principal,
    @Query('organization_id', new ZodPipe(uuid)) org: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.overview(p.user_id, this.query(org, from, to));
  }

  @Get('usage')
  usage(
    @CurrentPrincipal() p: Principal,
    @Query('organization_id', new ZodPipe(uuid)) org: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.usage(p.user_id, this.query(org, from, to));
  }

  @Get('ledger')
  ledger(
    @CurrentPrincipal() p: Principal,
    @Query('organization_id', new ZodPipe(uuid)) org: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.ledger(p.user_id, this.query(org, from, to));
  }

  @Post('price-cards')
  card(
    @CurrentPrincipal() p: Principal,
    @Body(new ZodPipe(priceCardSchema)) b: z.infer<typeof priceCardSchema>,
  ) {
    return this.service.priceCard(p.user_id, b);
  }

  @Get('price-cards')
  cards(
    @CurrentPrincipal() p: Principal,
    @Query('organization_id', new ZodPipe(uuid)) org: string,
  ) {
    return this.service.priceCards(p.user_id, org);
  }

  @Post('reconciliations')
  reconcile(
    @CurrentPrincipal() p: Principal,
    @Body(new ZodPipe(reconcileBodySchema)) b: { organization_id: string },
  ) {
    return this.service.reconcile(p.user_id, b.organization_id);
  }
}
