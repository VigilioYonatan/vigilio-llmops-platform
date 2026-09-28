import { Module } from '@nestjs/common';
import { CoreModule } from './core.module';
import { DatabaseModule } from './database/database.module';
import { ApplicationsModule } from './modules/applications/applications.module';
import { DatasetsModule } from './modules/datasets/datasets.module';
import { EvaluationsModule } from './modules/evaluations/evaluations.module';
import { FinopsModule } from './modules/finops/finops.module';
import { GatewayModule } from './modules/gateway/gateway.module';
import { GovernanceModule } from './modules/governance/governance.module';
import { IdentityModule } from './modules/identity/identity.module';
import { KnowledgeModule } from './modules/knowledge/knowledge.module';
import { ModelCatalogModule } from './modules/model-catalog/model-catalog.module';
import { OperationsModule } from './modules/operations/operations.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { PromptsModule } from './modules/prompts/prompts.module';
import { ReleasesModule } from './modules/releases/releases.module';
import { SystemModule } from './modules/system/system.module';
import { TelemetryModule } from './modules/telemetry/telemetry.module';

@Module({
  imports: [
    DatabaseModule,
    CoreModule,
    IdentityModule,
    OrganizationsModule,
    ApplicationsModule,
    PromptsModule,
    DatasetsModule,
    EvaluationsModule,
    TelemetryModule,
    FinopsModule,
    GatewayModule,
    ReleasesModule,
    ModelCatalogModule,
    OperationsModule,
    GovernanceModule,
    KnowledgeModule,
    SystemModule,
  ],
})
export class AppModule {}
