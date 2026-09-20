import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import { RequireApiKey } from '../../../../shared/http/api-key.decorator';
import {
  type AuthenticatedRequest,
  CurrentPrincipal,
  type Principal,
} from '../../../../shared/http/principal';
import { ZodPipe } from '../../../../shared/http/zod.pipe';
import { TelemetryExtensionsService } from '../../application/telemetry-extensions.service';
import { TracesService } from '../../application/traces.service';
import {
  type EventRequestDto,
  eventSchema,
  type FeedbackRequestDto,
  feedbackSchema,
  type IngestTraceRequestDto,
  ingestTraceSchema,
  type OtlpMetricsRequestDto,
  type OtlpTracesRequestDto,
  otlpMetricsSchema,
  otlpTracesSchema,
  type ReplayRequestDto,
  replaySchema,
} from './dto/trace.dto';

const uuidPipe = new ZodPipe(z.string().uuid());

function getApp(req: AuthenticatedRequest) {
  if (!req.application) throw new Error('API key guard missing application');
  return req.application;
}

@Controller('api/v1/traces')
export class TracesController {
  constructor(
    private readonly tracesService: TracesService,
    private readonly extensionsService: TelemetryExtensionsService,
  ) {}

  @Get()
  list(
    @CurrentPrincipal() principal: Principal,
    @Query('workspace_id', uuidPipe) workspace_id: string,
    @Query(
      'limit',
      new ZodPipe(z.coerce.number().int().min(1).max(100).default(50)),
    )
    limit: number,
  ) {
    return this.tracesService.list(principal.user_id, workspace_id, limit);
  }

  @Get('summary')
  summary(
    @CurrentPrincipal() principal: Principal,
    @Query('workspace_id', uuidPipe) workspace_id: string,
  ) {
    return this.tracesService.summary(principal.user_id, workspace_id);
  }

  @Get(':id')
  get(
    @CurrentPrincipal() principal: Principal,
    @Param('id', uuidPipe) id: string,
  ) {
    return this.tracesService.get(principal.user_id, id);
  }

  @Get(':trace_id/spans')
  spans(
    @CurrentPrincipal() p: Principal,
    @Param('trace_id', uuidPipe) t: string,
  ) {
    return this.extensionsService.spans(p.user_id, t);
  }

  @Get(':trace_id/feedback')
  feedback(
    @CurrentPrincipal() p: Principal,
    @Param('trace_id', uuidPipe) t: string,
  ) {
    return this.extensionsService.traceFeedback(p.user_id, t);
  }

  @Post(':trace_id/replay')
  replay(
    @CurrentPrincipal() p: Principal,
    @Param('trace_id', uuidPipe) t: string,
    @Body(new ZodPipe(replaySchema)) b: ReplayRequestDto,
  ) {
    return this.extensionsService.replay(p.user_id, t, b);
  }
}

@Controller('api/v1/ingest')
export class TraceIngestController {
  constructor(private readonly tracesService: TracesService) {}

  @RequireApiKey('traces:write')
  @Post('traces')
  ingest(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodPipe(ingestTraceSchema)) body: IngestTraceRequestDto,
  ) {
    return this.tracesService.ingest(getApp(request), body);
  }
}

@Controller('otlp/v1')
export class OtlpController {
  constructor(private readonly service: TelemetryExtensionsService) {}

  @RequireApiKey('traces:write')
  @Post('traces')
  traces(
    @Req() r: AuthenticatedRequest,
    @Body(new ZodPipe(otlpTracesSchema)) b: OtlpTracesRequestDto,
  ) {
    return this.service.otlpTraces(getApp(r), b);
  }

  @RequireApiKey('traces:write')
  @Post('metrics')
  metrics(
    @Req() r: AuthenticatedRequest,
    @Body(new ZodPipe(otlpMetricsSchema)) b: OtlpMetricsRequestDto,
  ) {
    return this.service.otlpMetrics(getApp(r), b);
  }
}

@Controller('api/v1/sdk')
export class SdkController {
  constructor(private readonly service: TelemetryExtensionsService) {}

  @RequireApiKey('traces:write')
  @Post('events')
  event(
    @Req() r: AuthenticatedRequest,
    @Body(new ZodPipe(eventSchema)) b: EventRequestDto,
  ) {
    return this.service.sdkEvent(getApp(r), b);
  }

  @RequireApiKey('traces:write')
  @Post('feedback')
  feedback(
    @Req() r: AuthenticatedRequest,
    @Body(new ZodPipe(feedbackSchema)) b: FeedbackRequestDto,
  ) {
    return this.service.feedback(getApp(r), b);
  }
}

@Controller('api/v1/applications')
export class ApplicationTelemetryController {
  constructor(private readonly service: TelemetryExtensionsService) {}

  @Get(':application_id/timeseries')
  timeseries(
    @CurrentPrincipal() p: Principal,
    @Param('application_id', uuidPipe) a: string,
  ) {
    return this.service.timeseries(p.user_id, a);
  }

  @Get(':application_id/errors')
  errors(
    @CurrentPrincipal() p: Principal,
    @Param('application_id', uuidPipe) a: string,
  ) {
    return this.service.errors(p.user_id, a);
  }
}
