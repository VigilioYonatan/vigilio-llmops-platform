import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { z } from 'zod';
import { RequireApiKey } from '../../../../shared/http/api-key.decorator';
import { AuthenticatedRequest } from '../../../../shared/http/principal';
import { ZodPipe } from '../../../../shared/http/zod.pipe';
import { GatewayService } from '../../application/gateway.service';
import {
  type CompletionRequestDto,
  completionSchema,
  type EmbeddingsRequestDto,
  embeddingsSchema,
  type GenerateRequestDto,
  generateSchema,
} from './dto/gateway.dto';

function extractApp(req: AuthenticatedRequest) {
  if (!req.application) throw new Error('Missing application scope');
  return req.application;
}

@Controller('api/v1/gateway')
export class GatewayController {
  constructor(private readonly gatewayService: GatewayService) {}

  @RequireApiKey('gateway:execute')
  @Post('generate')
  generate(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodPipe(generateSchema)) body: GenerateRequestDto,
  ) {
    return this.gatewayService.generate(extractApp(request), body);
  }
}

@Controller('v1')
export class OpenAiCompatibilityController {
  constructor(private readonly gatewayService: GatewayService) {}

  @RequireApiKey('gateway:execute')
  @Get('models')
  models(@Req() r: AuthenticatedRequest) {
    return this.gatewayService.models(extractApp(r));
  }

  @RequireApiKey('gateway:execute')
  @Post('chat/completions')
  completions(
    @Req() r: AuthenticatedRequest,
    @Body(new ZodPipe(completionSchema)) b: CompletionRequestDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.gatewayService.complete(extractApp(r), b, idempotencyKey);
  }

  @RequireApiKey('gateway:execute')
  @Post('embeddings')
  embeddings(
    @Req() r: AuthenticatedRequest,
    @Body(new ZodPipe(embeddingsSchema)) b: EmbeddingsRequestDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.gatewayService.embeddings(extractApp(r), b, idempotencyKey);
  }
}

@Controller('api/v1/gateway/requests')
export class GatewayRequestsController {
  constructor(private readonly gatewayService: GatewayService) {}

  @RequireApiKey('gateway:execute')
  @Get(':request_id')
  status(
    @Req() r: AuthenticatedRequest,
    @Param('request_id', new ZodPipe(z.string().uuid())) id: string,
  ) {
    return this.gatewayService.status(extractApp(r), id);
  }
}
