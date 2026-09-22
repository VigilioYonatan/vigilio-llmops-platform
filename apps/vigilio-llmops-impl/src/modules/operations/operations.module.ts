import { Module } from '@nestjs/common';
import { OperationsService } from './application/operations.service';
import { OPERATIONS_REPOSITORY } from './application/ports/operations.port';
import { OperationsDrizzleRepository } from './infrastructure/persistence/drizzle/operations.repository';
import { registerOperationsDocs } from './presentation/http/doc/operations.doc';
import {
  AlertRulesController,
  AlertsController,
  IncidentsController,
} from './presentation/http/operations.controller';

registerOperationsDocs();

@Module({
  controllers: [AlertRulesController, AlertsController, IncidentsController],
  providers: [
    OperationsService,
    {
      provide: OPERATIONS_REPOSITORY,
      useClass: OperationsDrizzleRepository,
    },
  ],
  exports: [OperationsService],
})
export class OperationsModule {}
