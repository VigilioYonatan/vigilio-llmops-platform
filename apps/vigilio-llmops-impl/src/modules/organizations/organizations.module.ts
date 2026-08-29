import './presentation/http/doc/organizations.doc';
import { Module } from '@nestjs/common';
import { OrganizationsService } from './application/organizations.service';
import { ORGANIZATIONS_REPOSITORY_PORT } from './application/ports/organizations.port';
import { WorkspaceManagementService } from './application/workspace-management.service';
import { OrganizationsDrizzleRepository } from './infrastructure/persistence/drizzle/organizations.repository';
import {
  InvitationsController,
  OrganizationsController,
  WorkspacesController,
} from './presentation/http/organizations.controller';

@Module({
  controllers: [
    OrganizationsController,
    InvitationsController,
    WorkspacesController,
  ],
  providers: [
    OrganizationsService,
    WorkspaceManagementService,
    OrganizationsDrizzleRepository,
    {
      provide: ORGANIZATIONS_REPOSITORY_PORT,
      useExisting: OrganizationsDrizzleRepository,
    },
  ],
  exports: [OrganizationsService, WorkspaceManagementService],
})
export class OrganizationsModule {}
