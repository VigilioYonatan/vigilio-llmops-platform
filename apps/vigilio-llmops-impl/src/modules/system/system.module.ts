import { Module } from '@nestjs/common';
import { SYSTEM_REPOSITORY } from './application/ports/system.port';
import { SystemMetricsService } from './application/system-metrics.service';
import { SystemDrizzleRepository } from './infrastructure/persistence/drizzle/system.repository';
import { registerSystemDocs } from './presentation/http/doc/system.doc';
import {
  MetricsController,
  SystemController,
} from './presentation/http/system.controller';

registerSystemDocs();

@Module({
  controllers: [SystemController, MetricsController],
  providers: [
    SystemMetricsService,
    {
      provide: SYSTEM_REPOSITORY,
      useClass: SystemDrizzleRepository,
    },
  ],
  exports: [SystemMetricsService],
})
export class SystemModule {}
