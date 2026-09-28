import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuditService } from './shared/audit.service';
import { HealthController } from './shared/http/health.controller';
import { SessionGuard } from './shared/http/session.guard';
import { RateLimitService } from './shared/security/rate-limit.service';
import { TenancyService } from './shared/tenancy.service';
@Global()
@Module({
  controllers: [HealthController],
  providers: [
    AuditService,
    TenancyService,
    RateLimitService,
    { provide: APP_GUARD, useClass: SessionGuard },
  ],
  exports: [AuditService, TenancyService, RateLimitService],
})
export class CoreModule {}
