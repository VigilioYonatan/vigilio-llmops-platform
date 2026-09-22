import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import {
  CurrentPrincipal,
  type Principal,
} from '../../../../shared/http/principal';
import { ZodPipe } from '../../../../shared/http/zod.pipe';
import { OperationsService } from '../../application/operations.service';
import {
  alertRulePatchSchema,
  alertRuleSchema,
  incidentCreateSchema,
  incidentEventSchema,
  incidentRegressionSchema,
  incidentResolveSchema,
} from './dto/operations.dto';

const id = z.uuid();
@Controller('api/v1/alert-rules')
export class AlertRulesController {
  constructor(private readonly service: OperationsService) {}
  @Post() create(
    @CurrentPrincipal() p: Principal,
    @Body(new ZodPipe(alertRuleSchema)) b: z.infer<typeof alertRuleSchema>,
  ) {
    return this.service.addRule(p.user_id, b);
  }
  @Get() list(
    @CurrentPrincipal() p: Principal,
    @Query('workspace_id', new ZodPipe(id)) ws: string,
  ) {
    return this.service.rules(p.user_id, ws);
  }
  @Patch(':rule_id') patch(
    @CurrentPrincipal() p: Principal,
    @Param('rule_id', new ZodPipe(id)) r: string,
    @Body(new ZodPipe(alertRulePatchSchema)) b: z.infer<
      typeof alertRulePatchSchema
    >,
  ) {
    return this.service.patchRule(p.user_id, r, b);
  }
}
@Controller('api/v1/alerts')
export class AlertsController {
  constructor(private readonly service: OperationsService) {}
  @Get() list(
    @CurrentPrincipal() p: Principal,
    @Query('workspace_id', new ZodPipe(id)) ws: string,
  ) {
    return this.service.alerts(p.user_id, ws);
  }
  @Post(':alert_id/acknowledge') ack(
    @CurrentPrincipal() p: Principal,
    @Param('alert_id', new ZodPipe(id)) alert: string,
  ) {
    return this.service.acknowledge(p.user_id, alert);
  }
}
@Controller('api/v1/incidents')
export class IncidentsController {
  constructor(private readonly service: OperationsService) {}
  @Post() create(
    @CurrentPrincipal() p: Principal,
    @Body(new ZodPipe(incidentCreateSchema)) b: z.infer<
      typeof incidentCreateSchema
    >,
  ) {
    return this.service.addIncident(p.user_id, b);
  }
  @Get() list(
    @CurrentPrincipal() p: Principal,
    @Query('workspace_id', new ZodPipe(id)) ws: string,
  ) {
    return this.service.incidents(p.user_id, ws);
  }
  @Get(':incident_id') get(
    @CurrentPrincipal() p: Principal,
    @Param('incident_id', new ZodPipe(id)) incident: string,
  ) {
    return this.service.incidentDetail(p.user_id, incident);
  }
  @Post(':incident_id/events') event(
    @CurrentPrincipal() p: Principal,
    @Param('incident_id', new ZodPipe(id)) incident: string,
    @Body(new ZodPipe(incidentEventSchema)) b: z.infer<
      typeof incidentEventSchema
    >,
  ) {
    return this.service.incidentEvent(p.user_id, incident, b);
  }
  @Post(':incident_id/resolve') resolve(
    @CurrentPrincipal() p: Principal,
    @Param('incident_id', new ZodPipe(id)) incident: string,
    @Body(new ZodPipe(incidentResolveSchema)) b: z.infer<
      typeof incidentResolveSchema
    >,
  ) {
    return this.service.resolve(p.user_id, incident, b);
  }
  @Post(':incident_id/regressions') regression(
    @CurrentPrincipal() p: Principal,
    @Param('incident_id', new ZodPipe(id)) incident: string,
    @Body(new ZodPipe(incidentRegressionSchema)) b: z.infer<
      typeof incidentRegressionSchema
    >,
  ) {
    return this.service.regression(p.user_id, incident, b);
  }
}
