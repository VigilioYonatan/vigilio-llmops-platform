import { forwardRef, Module } from '@nestjs/common';
import { EvaluationsModule } from '../evaluations/evaluations.module';
import { TELEMETRY_REPOSITORY } from './application/ports/telemetry.port';
import { TelemetryExtensionsService } from './application/telemetry-extensions.service';
import { TracesService } from './application/traces.service';
import { TelemetryDrizzleRepository } from './infrastructure/persistence/drizzle/telemetry.repository';
import { registerTelemetryDocs } from './presentation/http/doc/telemetry.doc';
import {
  ApplicationTelemetryController,
  OtlpController,
  SdkController,
  TraceIngestController,
  TracesController,
} from './presentation/http/traces.controller';

registerTelemetryDocs();

@Module({
  controllers: [
    TracesController,
    TraceIngestController,
    OtlpController,
    SdkController,
    ApplicationTelemetryController,
  ],
  providers: [
    TracesService,
    TelemetryExtensionsService,
    {
      provide: TELEMETRY_REPOSITORY,
      useClass: TelemetryDrizzleRepository,
    },
  ],
  imports: [forwardRef(() => EvaluationsModule)],
  exports: [TracesService, TelemetryExtensionsService],
})
export class TelemetryModule {}
