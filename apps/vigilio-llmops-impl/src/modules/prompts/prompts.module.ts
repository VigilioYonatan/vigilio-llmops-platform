import { Module } from '@nestjs/common';
import { FinopsModule } from '../finops/finops.module';
import { GatewayModule } from '../gateway/gateway.module';
import { PROMPTS_REPOSITORY } from './application/ports/prompts.port';
import { PromptsService } from './application/prompts.service';
import { PromptsDrizzleRepository } from './infrastructure/persistence/drizzle/prompts.repository';
import { registerPromptsDocs } from './presentation/http/doc/prompts.doc';
import {
  AppPromptsController,
  PromptsController,
} from './presentation/http/prompts.controller';

registerPromptsDocs();

@Module({
  controllers: [PromptsController, AppPromptsController],
  providers: [
    PromptsService,
    {
      provide: PROMPTS_REPOSITORY,
      useClass: PromptsDrizzleRepository,
    },
  ],
  imports: [FinopsModule, GatewayModule],
  exports: [PromptsService],
})
export class PromptsModule {}
