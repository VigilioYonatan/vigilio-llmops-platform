import { timingSafeEqual } from 'node:crypto';
import {
  Controller,
  Get,
  Headers,
  Res,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Response } from 'express';
import { config } from '../../../../shared/config';
import { Public } from '../../../../shared/http/public.decorator';
import { SystemMetricsService } from '../../application/system-metrics.service';

function safeTokenCompare(candidate: string, secret: string): boolean {
  const x = Buffer.from(candidate);
  const y = Buffer.from(secret);
  return x.length === y.length && timingSafeEqual(x, y);
}

@Controller('api/v1/system')
export class SystemController {
  @Public()
  @Get('capabilities')
  capabilities() {
    return {
      platform: 'vigilio-llmops',
      version: '1.0.0',
      self_hosted: true,
      local_passwords: true,
      facebook_login: Boolean(config.FACEBOOK_APP_ID),
      prompts: true,
      dataset_snapshots: true,
      deterministic_evaluation: true,
      llm_judge_calibrated: false,
      canary_weighted: false,
      otlp_json: true,
      otlp_protobuf: false,
      rag_fts: true,
      rag_hybrid_pgvector: true,
      finops_fixed_point_ledger: true,
    };
  }

  @Public()
  @Get('version')
  version() {
    return {
      api: 'v1',
      application: '1.0.0',
      build_sha: process.env.BUILD_SHA ?? 'unknown',
      runtime: 'node',
    };
  }
}

@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: SystemMetricsService) {}

  @Public()
  @Get()
  async metrics(
    @Headers('authorization') authorization: string | undefined,
    @Res() res: Response,
  ) {
    const secret = config.METRICS_TOKEN;
    if (!secret) {
      throw new ServiceUnavailableException('Metrics secret is not configured');
    }
    if (
      !authorization ||
      !safeTokenCompare(authorization, `Bearer ${secret}`)
    ) {
      throw new UnauthorizedException('Metrics authentication failed');
    }
    const lines = await this.metricsService.snapshot();
    res.setHeader('content-type', 'text/plain; version=0.0.4; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    return res.status(200).send(`${lines.join('\n')}\n`);
  }
}
