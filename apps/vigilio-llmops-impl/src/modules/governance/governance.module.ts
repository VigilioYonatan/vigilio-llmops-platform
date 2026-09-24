import { Module } from '@nestjs/common';
import { GovernanceService } from './application/governance.service';
import { GOVERNANCE_REPOSITORY } from './application/ports/governance.port';
import { GovernanceDrizzleRepository } from './infrastructure/persistence/drizzle/governance.repository';
import { registerGovernanceDocs } from './presentation/http/doc/governance.doc';
import {
  AuditEventsController,
  DataRequestsController,
} from './presentation/http/governance.controller';

registerGovernanceDocs();

@Module({
  controllers: [AuditEventsController, DataRequestsController],
  providers: [
    GovernanceService,
    {
      provide: GOVERNANCE_REPOSITORY,
      useClass: GovernanceDrizzleRepository,
    },
  ],
  exports: [GovernanceService],
})
export class GovernanceModule {}
