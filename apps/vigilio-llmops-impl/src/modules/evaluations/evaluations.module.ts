import { forwardRef, Module } from '@nestjs/common';
import { GatewayModule } from '../gateway/gateway.module';
import { EvaluationLifecycleService } from './application/evaluation-lifecycle.service';
import { EvaluationsService } from './application/evaluations.service';
import { EVALUATIONS_REPOSITORY } from './application/ports/evaluations.port';
import { EvaluationsDrizzleRepository } from './infrastructure/persistence/drizzle/evaluations.repository';
import { registerEvaluationsDocs } from './presentation/http/doc/evaluations.doc';
import {
  EvaluationComparisonsController,
  EvaluationsController,
  EvaluatorsController,
} from './presentation/http/evaluations.controller';

registerEvaluationsDocs();

@Module({
  controllers: [
    EvaluationsController,
    EvaluatorsController,
    EvaluationComparisonsController,
  ],
  providers: [
    EvaluationsService,
    EvaluationLifecycleService,
    {
      provide: EVALUATIONS_REPOSITORY,
      useClass: EvaluationsDrizzleRepository,
    },
  ],
  imports: [forwardRef(() => GatewayModule)],
  exports: [EvaluationsService, EvaluationLifecycleService],
})
export class EvaluationsModule {}
