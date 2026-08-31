import './presentation/http/doc/applications.doc';
import { Module } from '@nestjs/common';
import { ApplicationsService } from './application/applications.service';
import { APPLICATIONS_REPOSITORY_PORT } from './application/ports/applications.port';
import { ApplicationsDrizzleRepository } from './infrastructure/persistence/drizzle/applications.repository';
import {
  ApplicationsController,
  ScopedApplicationsController,
} from './presentation/http/applications.controller';

@Module({
  controllers: [ApplicationsController, ScopedApplicationsController],
  providers: [
    ApplicationsService,
    ApplicationsDrizzleRepository,
    {
      provide: APPLICATIONS_REPOSITORY_PORT,
      useExisting: ApplicationsDrizzleRepository,
    },
  ],
  exports: [ApplicationsService],
})
export class ApplicationsModule {}
