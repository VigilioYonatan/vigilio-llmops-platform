import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  CurrentPrincipal,
  type Principal,
} from '../../../../shared/http/principal';
import { ZodPipe } from '../../../../shared/http/zod.pipe';
import { GovernanceService } from '../../application/governance.service';
import { type DataRequestDto, dataRequestSchema } from './dto/governance.dto';

const uuidPipe = new ZodPipe(z.string().uuid());

@Controller('api/v1/audit-events')
export class AuditEventsController {
  constructor(private readonly service: GovernanceService) {}

  @Get()
  list(
    @CurrentPrincipal() p: Principal,
    @Query('organization_id', uuidPipe) org: string,
    @Query(
      'limit',
      new ZodPipe(z.coerce.number().int().min(1).max(100).default(50)),
    )
    limit: number,
    @Query('before', new ZodPipe(z.coerce.number().int().positive().optional()))
    before?: number,
  ) {
    return this.service.auditEvents(p.user_id, org, limit, before);
  }

  @Get(':event_id')
  detail(
    @CurrentPrincipal() p: Principal,
    @Param('event_id', new ZodPipe(z.coerce.number().int().positive()))
    id: number,
  ) {
    return this.service.auditEvent(p.user_id, id);
  }
}

@Controller('api/v1/data-requests')
export class DataRequestsController {
  constructor(private readonly service: GovernanceService) {}

  @Get()
  list(@CurrentPrincipal() p: Principal) {
    return this.service.myRequests(p.user_id);
  }

  @Post('export')
  export(
    @CurrentPrincipal() p: Principal,
    @Body(new ZodPipe(dataRequestSchema)) b: DataRequestDto,
  ) {
    return this.service.request(p.user_id, 'export', b.reason);
  }

  @Post('delete')
  delete(
    @CurrentPrincipal() p: Principal,
    @Body(new ZodPipe(dataRequestSchema)) b: DataRequestDto,
  ) {
    return this.service.request(p.user_id, 'delete', b.reason);
  }

  @Get(':request_id')
  status(
    @CurrentPrincipal() p: Principal,
    @Param('request_id', uuidPipe) id: string,
  ) {
    return this.service.requestStatus(p.user_id, id);
  }
}
