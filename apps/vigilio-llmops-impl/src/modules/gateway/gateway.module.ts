import { forwardRef, Module } from '@nestjs/common';
import { FinopsModule } from '../finops/finops.module';
import { TelemetryModule } from '../telemetry/telemetry.module';
import { GatewayService } from './application/gateway.service';
import { ModelInferenceService } from './application/model-inference.service';
import { GATEWAY_REPOSITORY } from './application/ports/gateway.port';
import { GatewayDrizzleRepository } from './infrastructure/persistence/drizzle/gateway.repository';
import { registerGatewayDocs } from './presentation/http/doc/gateway.doc';
import {
  GatewayController,
  GatewayRequestsController,
  OpenAiCompatibilityController,
} from './presentation/http/gateway.controller';

registerGatewayDocs();

@Module({
  controllers: [
    GatewayController,
    OpenAiCompatibilityController,
    GatewayRequestsController,
  ],
  providers: [
    ModelInferenceService,
    GatewayService,
    {
      provide: GATEWAY_REPOSITORY,
      useClass: GatewayDrizzleRepository,
    },
  ],
  imports: [forwardRef(() => TelemetryModule), FinopsModule],
  exports: [ModelInferenceService, GatewayService],
})
export class GatewayModule {}
