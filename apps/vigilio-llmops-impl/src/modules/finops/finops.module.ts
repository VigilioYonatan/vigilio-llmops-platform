import './presentation/http/doc/finops.doc';
import { Module } from '@nestjs/common';
import { BudgetService } from './application/budget.service';
import { FinopsAnalyticsService } from './application/finops-analytics.service';
import { FINOPS_REPOSITORY_PORT } from './application/ports/finops.port';
import { FinopsDrizzleRepository } from './infrastructure/persistence/drizzle/finops.repository';
import {
  BudgetPoliciesController,
  BudgetsController,
  CostsController,
} from './presentation/http/budgets.controller';

@Module({
  controllers: [BudgetsController, BudgetPoliciesController, CostsController],
  providers: [
    BudgetService,
    FinopsAnalyticsService,
    FinopsDrizzleRepository,
    {
      provide: FINOPS_REPOSITORY_PORT,
      useExisting: FinopsDrizzleRepository,
    },
  ],
  exports: [BudgetService, FinopsAnalyticsService],
})
export class FinopsModule {}
