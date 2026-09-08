import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RateLimitService } from '../../../shared/security/rate-limit.service';
import { BudgetService } from '../../finops/application/budget.service';
import { TracesService } from '../../telemetry/application/traces.service';
import {
  CompletionRequestDto,
  EmbeddingsRequestDto,
  GenerateRequestDto,
} from '../presentation/http/dto/gateway.dto';
import {
  InferenceOutput,
  ModelInferenceService,
} from './model-inference.service';
import {
  GATEWAY_REPOSITORY,
  type GatewayRepository,
  type GatewayRouteRecord,
} from './ports/gateway.port';

interface AppPrincipal {
  id: string;
  organization_id: string;
  workspace_id: string;
}

@Injectable()
export class GatewayService {
  constructor(
    @Inject(GATEWAY_REPOSITORY) private readonly repository: GatewayRepository,
    private readonly modelInferenceService: ModelInferenceService,
    private readonly budgetService: BudgetService,
    private readonly tracesService: TracesService,
    private readonly rateLimitService: RateLimitService,
  ) {}

  async allowedModels(app: AppPrincipal): Promise<GatewayRouteRecord[]> {
    return this.repository.listAllowedModels(app.id, app.organization_id);
  }

  async models(app: AppPrincipal) {
    const list = await this.allowedModels(app);
    return {
      object: 'list',
      data: list.map((m) => ({
        id: m.name,
        object: 'model',
        owned_by: 'vigilio-selfhosted',
        digest: m.digest,
        capabilities: m.capabilities,
      })),
    };
  }

  async ensureAllowed(
    app: AppPrincipal,
    modelName: string,
    capability: string,
  ): Promise<GatewayRouteRecord> {
    const route = await this.repository.findAuthorizedRoute(
      app.id,
      app.organization_id,
      modelName,
      capability,
    );
    if (!route) {
      throw new ForbiddenException(
        'Model is not enabled in this application environment',
      );
    }
    return route;
  }

  async generate(app: AppPrincipal, body: GenerateRequestDto) {
    await this.rateLimitService.consume(`ratelimit:gateway:${app.id}`, 120, 60);

    const authorized = await this.ensureAllowed(app, body.model, 'chat');
    const reserved = await this.budgetService.reserve(
      app.organization_id,
      body.idempotency_key,
      '0.001000',
    );
    if (reserved.duplicate) {
      throw new ConflictException(
        'Request with this idempotency key already processed or in progress',
      );
    }

    const trace_id = randomUUID();
    const request = await this.repository.createRequest(
      app.organization_id,
      app.id,
      body.idempotency_key,
      body.model,
    );
    if (!request) {
      throw new ConflictException('Request already recorded');
    }

    try {
      let result: InferenceOutput;
      try {
        result = await this.modelInferenceService.infer(
          body.model,
          body.prompt,
          authorized.kind as 'ollama' | 'openai-compatible',
        );
      } catch (err) {
        if (authorized.fallback_model_id) {
          const fallback = (await this.allowedModels(app)).find(
            (m) => m.id === authorized.fallback_model_id,
          );
          if (fallback) {
            result = await this.modelInferenceService.infer(
              fallback.name,
              body.prompt,
              fallback.kind as 'ollama' | 'openai-compatible',
            );
          } else {
            throw err;
          }
        } else {
          throw err;
        }
      }

      const cost = await this.budgetService.calculateCostForUsage(
        app.organization_id,
        body.model,
        result.input_tokens,
        result.output_tokens,
        authorized.kind as 'ollama' | 'openai-compatible',
      );

      await this.tracesService.ingest(app, {
        trace_id,
        model: body.model,
        status: 'success',
        latency_ms: result.latency_ms,
        input_tokens: result.input_tokens,
        output_tokens: result.output_tokens,
        estimated_cost_usd: Number(cost.budgetUsd6),
        attributes: { source: 'gateway' },
      });

      await this.budgetService.settle(
        app.organization_id,
        reserved.id,
        cost.budgetUsd6,
        true,
        {
          workspace_id: app.workspace_id,
          application_id: app.id,
          model: body.model,
          source: 'gateway',
          input_tokens: result.input_tokens,
          output_tokens: result.output_tokens,
          amount_usd: cost.ledgerUsd8,
        },
      );

      await this.repository.updateRequestSuccess(
        request.id,
        trace_id,
        result.input_tokens,
        result.output_tokens,
      );

      return {
        trace_id,
        output: result.output,
        usage: {
          input_tokens: result.input_tokens,
          output_tokens: result.output_tokens,
          estimated_provider_cost_usd: cost.budgetUsd6,
        },
      };
    } catch (error) {
      await this.budgetService.settle(
        app.organization_id,
        reserved.id,
        '0',
        false,
      );
      await this.repository.updateRequestFailed(request.id);
      throw error;
    }
  }

  async complete(
    app: AppPrincipal,
    b: CompletionRequestDto,
    headerIdempotencyKey?: string,
  ) {
    const idempotencyKey =
      b.idempotency_key || headerIdempotencyKey || randomUUID();
    const authorized = await this.ensureAllowed(app, b.model, 'chat');

    await this.rateLimitService.consume(`ratelimit:gateway:${app.id}`, 120, 60);

    const reserved = await this.budgetService.reserve(
      app.organization_id,
      idempotencyKey,
      '0.001000',
    );
    if (reserved.duplicate) {
      throw new ConflictException(
        'Request with this idempotency key already processed or in progress',
      );
    }

    const trace_id = randomUUID();
    const request = await this.repository.createRequest(
      app.organization_id,
      app.id,
      idempotencyKey,
      b.model,
    );
    if (!request) {
      throw new ConflictException('Request already recorded');
    }

    try {
      const result = await this.modelInferenceService.inferChat(
        b.model,
        b.messages,
        authorized.kind as 'ollama' | 'openai-compatible',
        {
          temperature: b.temperature,
          maxTokens: b.max_tokens,
          topP: b.top_p,
        },
      );

      const cost = await this.budgetService.calculateCostForUsage(
        app.organization_id,
        b.model,
        result.input_tokens,
        result.output_tokens,
        authorized.kind as 'ollama' | 'openai-compatible',
      );

      await this.tracesService.ingest(app, {
        trace_id,
        model: b.model,
        status: 'success',
        latency_ms: result.latency_ms,
        input_tokens: result.input_tokens,
        output_tokens: result.output_tokens,
        estimated_cost_usd: Number(cost.budgetUsd6),
        attributes: { source: 'gateway' },
      });

      await this.budgetService.settle(
        app.organization_id,
        reserved.id,
        cost.budgetUsd6,
        true,
        {
          workspace_id: app.workspace_id,
          application_id: app.id,
          model: b.model,
          source: 'gateway',
          input_tokens: result.input_tokens,
          output_tokens: result.output_tokens,
          amount_usd: cost.ledgerUsd8,
        },
      );

      await this.repository.updateRequestSuccess(
        request.id,
        trace_id,
        result.input_tokens,
        result.output_tokens,
      );

      return {
        id: `chatcmpl-${trace_id}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: b.model,
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: result.output },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: result.input_tokens,
          completion_tokens: result.output_tokens,
          total_tokens: result.input_tokens + result.output_tokens,
        },
        trace_id,
      };
    } catch (error) {
      await this.budgetService.settle(
        app.organization_id,
        reserved.id,
        '0',
        false,
      );
      await this.repository.updateRequestFailed(request.id);
      throw error;
    }
  }

  async embeddings(
    app: AppPrincipal,
    b: EmbeddingsRequestDto,
    headerIdempotencyKey?: string,
  ) {
    const idempotencyKey =
      b.idempotency_key || headerIdempotencyKey || randomUUID();
    const authorized = await this.ensureAllowed(app, b.model, 'embeddings');

    if (authorized.kind !== 'ollama' && b.model !== 'builtin-hash-64') {
      throw new ForbiddenException(
        'Embeddings adapter currently supports Ollama or builtin-hash-64',
      );
    }

    const key = `embedding:${idempotencyKey}`;
    const reserved = await this.budgetService.reserve(
      app.organization_id,
      key,
      '0.001000',
    );
    if (reserved.duplicate) {
      throw new ForbiddenException('Idempotency key already used');
    }

    try {
      const inputs = typeof b.input === 'string' ? [b.input] : b.input;
      const vectors = await this.modelInferenceService.embed(b.model, inputs);

      await this.budgetService.settle(
        app.organization_id,
        reserved.id,
        '0',
        true,
      );

      return {
        object: 'list',
        model: b.model,
        data: vectors.map((embedding, index) => ({
          object: 'embedding',
          index,
          embedding,
        })),
        usage: {
          prompt_tokens: 0,
          total_tokens: 0,
          estimated_provider_cost_usd: '0.000000',
        },
      };
    } catch (error) {
      await this.budgetService.settle(
        app.organization_id,
        reserved.id,
        '0',
        false,
      );
      throw error;
    }
  }

  async status(app: AppPrincipal, id: string) {
    const row = await this.repository.findRequestStatus(app.id, id);
    if (!row) throw new NotFoundException();
    return row;
  }
}
