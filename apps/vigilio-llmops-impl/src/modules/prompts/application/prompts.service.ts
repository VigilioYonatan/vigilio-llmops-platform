import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../../shared/audit.service';
import { sha256 } from '../../../shared/crypto';
import { TenancyService } from '../../../shared/tenancy.service';
import { BudgetService } from '../../finops/application/budget.service';
import { ModelInferenceService } from '../../gateway/application/model-inference.service';
import {
  lineDiff,
  renderTemplateVariables,
  validateTemplate,
} from '../domain/prompt-template';
import {
  AliasRequestDto,
  AppPromptRequestDto,
  CreatePromptRequestDto,
  CreatePromptVersionRequestDto,
  DiffRequestDto,
  PlaygroundRequestDto,
} from '../presentation/http/dto/prompt.dto';
import {
  PROMPTS_REPOSITORY,
  type PromptsRepository,
} from './ports/prompts.port';

@Injectable()
export class PromptsService {
  constructor(
    @Inject(PROMPTS_REPOSITORY) private readonly repository: PromptsRepository,
    private readonly tenancyService: TenancyService,
    private readonly auditService: AuditService,
    private readonly budgetService: BudgetService,
    private readonly modelInferenceService: ModelInferenceService,
  ) {}

  async create(userId: string, body: CreatePromptRequestDto) {
    const ws = await this.tenancyService.workspace(userId, body.workspace_id, [
      'owner',
      'admin',
      'developer',
    ]);
    const row = await this.repository.create(
      ws.organization_id,
      body.workspace_id,
      body.name,
      body.description ?? null,
      userId,
    );
    await this.auditService.write(
      'prompt.created',
      userId,
      ws.organization_id,
      'prompt',
      row.id,
    );
    return row;
  }

  async list(userId: string, workspaceId: string) {
    await this.tenancyService.workspace(userId, workspaceId);
    return this.repository.list(workspaceId);
  }

  async get(userId: string, id: string) {
    const prompt = await this.repository.findById(id);
    if (!prompt) throw new NotFoundException('Prompt not found');
    await this.tenancyService.membership(userId, prompt.organization_id);
    return prompt;
  }

  async versions(userId: string, id: string) {
    await this.get(userId, id);
    return this.repository.listVersions(id);
  }

  async version(userId: string, id: string, versionId: string) {
    await this.get(userId, id);
    const v = await this.repository.findVersion(id, versionId);
    if (!v) throw new NotFoundException('Version not found');
    return v;
  }

  async addVersion(
    userId: string,
    promptId: string,
    body: CreatePromptVersionRequestDto,
  ) {
    const prompt = await this.get(userId, promptId);
    await this.tenancyService.membership(userId, prompt.organization_id, [
      'owner',
      'admin',
      'developer',
    ]);
    const digest = sha256(
      JSON.stringify({
        template: body.template,
        model: body.model,
        parameters: body.parameters,
      }),
    );
    const row = await this.repository.createVersion(
      promptId,
      body.template,
      body.model,
      body.parameters,
      digest,
      userId,
    );
    await this.auditService.write(
      'prompt.version_created',
      userId,
      prompt.organization_id,
      'prompt',
      promptId,
      { version: row.version },
    );
    return row;
  }

  // Application-scoped prompt methods
  private async getApp(
    userId: string,
    appId: string,
    role?: Array<'owner' | 'admin' | 'developer'>,
  ) {
    const app = await this.repository.findApp(appId);
    if (!app) throw new NotFoundException('Application not found');
    await this.tenancyService.membership(userId, app.organization_id, role);
    return app;
  }

  async newPrompt(userId: string, appId: string, body: AppPromptRequestDto) {
    const app = await this.getApp(userId, appId, [
      'owner',
      'admin',
      'developer',
    ]);
    const row = await this.repository.create(
      app.organization_id,
      app.workspace_id,
      body.name,
      body.description ?? null,
      userId,
      appId,
    );
    await this.auditService.write(
      'prompt.created',
      userId,
      app.organization_id,
      'prompt',
      row.id,
    );
    return row;
  }

  async appPrompts(userId: string, appId: string) {
    await this.getApp(userId, appId);
    return this.repository.listByApp(appId);
  }

  async diff(userId: string, promptId: string, body: DiffRequestDto) {
    await this.get(userId, promptId);
    const versions = await this.repository.findVersions(promptId, [
      body.from_version_id,
      body.to_version_id,
    ]);
    if (versions.length !== 2)
      throw new NotFoundException('One or both versions not found');
    const vFrom = versions.find((v) => v.id === body.from_version_id)!;
    const vTo = versions.find((v) => v.id === body.to_version_id)!;
    return {
      from: body.from_version_id,
      to: body.to_version_id,
      ...lineDiff(vFrom.template, vTo.template),
    };
  }

  async validateVersion(userId: string, promptId: string, versionId: string) {
    const v = await this.version(userId, promptId, versionId);
    return validateTemplate(v.template);
  }

  async assignAlias(
    userId: string,
    promptId: string,
    environment: 'dev' | 'staging' | 'production',
    body: AliasRequestDto,
  ) {
    const prompt = await this.get(userId, promptId);
    await this.tenancyService.membership(userId, prompt.organization_id, [
      'owner',
      'admin',
      'developer',
    ]);
    const v = await this.repository.findVersion(
      promptId,
      body.prompt_version_id,
    );
    if (!v) throw new NotFoundException('Version not found');

    if (environment === 'production') {
      await this.tenancyService.membership(userId, prompt.organization_id, [
        'owner',
        'admin',
      ]);
      const release = await this.repository.findActiveRelease(
        body.prompt_version_id,
        prompt.workspace_id,
      );
      if (!release) {
        throw new ConflictException(
          'Production alias requires an active approved release',
        );
      }
    }

    const result = await this.repository.upsertAlias(
      promptId,
      environment,
      body.prompt_version_id,
      userId,
    );
    await this.auditService.write(
      'prompt.alias_changed',
      userId,
      prompt.organization_id,
      'prompt',
      promptId,
      { environment, version_id: body.prompt_version_id },
    );
    return result;
  }

  async aliases(userId: string, promptId: string) {
    await this.get(userId, promptId);
    return this.repository.listAliases(promptId);
  }

  async playground(
    userId: string,
    promptId: string,
    versionId: string,
    body: PlaygroundRequestDto,
  ) {
    const prompt = await this.get(userId, promptId);
    await this.tenancyService.membership(userId, prompt.organization_id, [
      'owner',
      'admin',
      'developer',
      'analyst',
    ]);
    const v = await this.version(userId, promptId, versionId);

    const renderedPrompt = renderTemplateVariables(
      v.template.replaceAll('{{input}}', body.input),
      body.variables,
    );

    const idempotencyKey = sha256(
      `playground:${userId}:${promptId}:${versionId}:${Date.now()}`,
    ).slice(0, 36);
    const reserved = await this.budgetService.reserve(
      prompt.organization_id,
      idempotencyKey,
      '0.001000',
    );

    try {
      const inference = await this.modelInferenceService.infer(
        v.model,
        renderedPrompt,
      );
      const cost = await this.budgetService.calculateCostForUsage(
        prompt.organization_id,
        v.model,
        inference.input_tokens,
        inference.output_tokens,
      );

      await this.budgetService.settle(
        prompt.organization_id,
        reserved.id,
        cost.budgetUsd6,
        true,
        {
          workspace_id: prompt.workspace_id,
          model: v.model,
          source: 'playground',
          input_tokens: inference.input_tokens,
          output_tokens: inference.output_tokens,
          amount_usd: cost.ledgerUsd8,
        },
      );

      return {
        rendered_prompt: renderedPrompt,
        output: inference.output,
        model: v.model,
        latency_ms: inference.latency_ms,
        usage: {
          input_tokens: inference.input_tokens,
          output_tokens: inference.output_tokens,
          estimated_provider_cost_usd: cost.budgetUsd6,
        },
      };
    } catch (error) {
      await this.budgetService.settle(
        prompt.organization_id,
        reserved.id,
        '0',
        false,
      );
      throw error;
    }
  }
}
