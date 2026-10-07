import 'reflect-metadata';
process.env.DATABASE_URL = 'postgresql://llmops:test@127.0.0.1:15432/llmops';
process.env.VALKEY_URL = 'redis://127.0.0.1:16379/0';
process.env.SESSION_SECRET = '01234567890123456789012345678901';
process.env.ENCRYPTION_KEY_B64 = Buffer.alloc(32, 1).toString('base64');
process.env.NODE_ENV = 'development';

import { Test } from '@nestjs/testing';
import { CoreModule } from '../src/core.module';
import { DatabaseModule } from '../src/database/database.module';
import { ApplicationsModule } from '../src/modules/applications/applications.module';
import { DatasetsModule } from '../src/modules/datasets/datasets.module';
import { EvaluationsModule } from '../src/modules/evaluations/evaluations.module';
import { FinopsModule } from '../src/modules/finops/finops.module';
import { GatewayModule } from '../src/modules/gateway/gateway.module';
import { GovernanceModule } from '../src/modules/governance/governance.module';
import { IdentityModule } from '../src/modules/identity/identity.module';
import { KnowledgeModule } from '../src/modules/knowledge/knowledge.module';
import { ModelCatalogModule } from '../src/modules/model-catalog/model-catalog.module';
import { OperationsModule } from '../src/modules/operations/operations.module';
import { OrganizationsModule } from '../src/modules/organizations/organizations.module';
import { PromptsModule } from '../src/modules/prompts/prompts.module';
import { ReleasesModule } from '../src/modules/releases/releases.module';
import { SystemModule } from '../src/modules/system/system.module';
import { TelemetryModule } from '../src/modules/telemetry/telemetry.module';

const list = [
  ['DatabaseModule', DatabaseModule],
  ['CoreModule', CoreModule],
  ['IdentityModule', IdentityModule],
  ['OrganizationsModule', OrganizationsModule],
  ['ApplicationsModule', ApplicationsModule],
  ['FinopsModule', FinopsModule],
  ['ModelCatalogModule', ModelCatalogModule],
  ['OperationsModule', OperationsModule],
  ['GovernanceModule', GovernanceModule],
  ['SystemModule', SystemModule],
  ['DatasetsModule', DatasetsModule],
  ['PromptsModule', PromptsModule],
  ['ReleasesModule', ReleasesModule],
  ['KnowledgeModule', KnowledgeModule],
  ['GatewayModule', GatewayModule],
  ['TelemetryModule', TelemetryModule],
  ['EvaluationsModule', EvaluationsModule],
];

async function run() {
  for (const [name, mod] of list) {
    console.log('Testing module:', name);
    try {
      const _ref = await Test.createTestingModule({
        imports: [DatabaseModule, CoreModule, mod as any],
      }).compile();
      console.log('PASS:', name);
    } catch (e) {
      console.error('FAIL:', name, e);
    }
  }
}

run();
