import { Module } from '@nestjs/common';
import { FinopsModule } from '../finops/finops.module';
import { GatewayModule } from '../gateway/gateway.module';
import { KnowledgeService } from './application/knowledge.service';
import { KNOWLEDGE_REPOSITORY } from './application/ports/knowledge.port';
import { KnowledgeDrizzleRepository } from './infrastructure/persistence/drizzle/knowledge.repository';
import { registerKnowledgeDocs } from './presentation/http/doc/knowledge.doc';
import { KnowledgeController } from './presentation/http/knowledge.controller';

registerKnowledgeDocs();

@Module({
  controllers: [KnowledgeController],
  providers: [
    KnowledgeService,
    {
      provide: KNOWLEDGE_REPOSITORY,
      useClass: KnowledgeDrizzleRepository,
    },
  ],
  imports: [GatewayModule, FinopsModule],
  exports: [KnowledgeService],
})
export class KnowledgeModule {}
