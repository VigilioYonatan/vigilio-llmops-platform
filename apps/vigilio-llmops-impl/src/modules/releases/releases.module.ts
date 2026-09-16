import { Module } from '@nestjs/common';
import { RELEASES_REPOSITORY } from './application/ports/releases.port';
import { ReleaseWorkflowService } from './application/release-workflow.service';
import { ReleasesService } from './application/releases.service';
import { ReleasesDrizzleRepository } from './infrastructure/persistence/drizzle/releases.repository';
import { registerReleasesDocs } from './presentation/http/doc/releases.doc';
import {
  QualityPoliciesController,
  ReleasesController,
} from './presentation/http/releases.controller';

registerReleasesDocs();

@Module({
  controllers: [ReleasesController, QualityPoliciesController],
  providers: [
    ReleasesService,
    ReleaseWorkflowService,
    {
      provide: RELEASES_REPOSITORY,
      useClass: ReleasesDrizzleRepository,
    },
  ],
  exports: [ReleasesService, ReleaseWorkflowService],
})
export class ReleasesModule {}
