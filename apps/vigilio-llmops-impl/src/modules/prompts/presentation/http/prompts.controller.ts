import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  CurrentPrincipal,
  type Principal,
} from '../../../../shared/http/principal';
import { ZodPipe } from '../../../../shared/http/zod.pipe';
import { PromptsService } from '../../application/prompts.service';
import {
  type AliasRequestDto,
  type AppPromptRequestDto,
  aliasSchema,
  appPromptSchema,
  type CreatePromptRequestDto,
  type CreatePromptVersionRequestDto,
  createPromptSchema,
  createPromptVersionSchema,
  type DiffRequestDto,
  diffSchema,
  type PlaygroundRequestDto,
  playgroundSchema,
} from './dto/prompt.dto';

const uuidPipe = new ZodPipe(z.string().uuid());
const envPipe = new ZodPipe(z.enum(['dev', 'staging', 'production']));

@Controller('api/v1/prompts')
export class PromptsController {
  constructor(private readonly promptsService: PromptsService) {}

  @Post()
  create(
    @CurrentPrincipal() principal: Principal,
    @Body(new ZodPipe(createPromptSchema)) body: CreatePromptRequestDto,
  ) {
    return this.promptsService.create(principal.user_id, body);
  }

  @Get()
  list(
    @CurrentPrincipal() principal: Principal,
    @Query('workspace_id', uuidPipe) workspace_id: string,
  ) {
    return this.promptsService.list(principal.user_id, workspace_id);
  }

  @Get(':id')
  get(
    @CurrentPrincipal() principal: Principal,
    @Param('id', uuidPipe) id: string,
  ) {
    return this.promptsService.get(principal.user_id, id);
  }

  @Get(':id/versions')
  versions(
    @CurrentPrincipal() principal: Principal,
    @Param('id', uuidPipe) id: string,
  ) {
    return this.promptsService.versions(principal.user_id, id);
  }

  @Post(':id/versions')
  addVersion(
    @CurrentPrincipal() principal: Principal,
    @Param('id', uuidPipe) id: string,
    @Body(new ZodPipe(createPromptVersionSchema))
    body: CreatePromptVersionRequestDto,
  ) {
    return this.promptsService.addVersion(principal.user_id, id, body);
  }

  @Get(':id/versions/:version_id')
  version(
    @CurrentPrincipal() principal: Principal,
    @Param('id', uuidPipe) id: string,
    @Param('version_id', uuidPipe) version_id: string,
  ) {
    return this.promptsService.version(principal.user_id, id, version_id);
  }

  @Post(':prompt_id/diff')
  diff(
    @CurrentPrincipal() p: Principal,
    @Param('prompt_id', uuidPipe) prompt: string,
    @Body(new ZodPipe(diffSchema)) b: DiffRequestDto,
  ) {
    return this.promptsService.diff(p.user_id, prompt, b);
  }

  @Post(':prompt_id/versions/:version_id/validate')
  validate(
    @CurrentPrincipal() p: Principal,
    @Param('prompt_id', uuidPipe) prompt: string,
    @Param('version_id', uuidPipe) version: string,
  ) {
    return this.promptsService.validateVersion(p.user_id, prompt, version);
  }

  @Put(':prompt_id/aliases/:environment')
  alias(
    @CurrentPrincipal() p: Principal,
    @Param('prompt_id', uuidPipe) prompt: string,
    @Param('environment', envPipe) env: 'dev' | 'staging' | 'production',
    @Body(new ZodPipe(aliasSchema)) b: AliasRequestDto,
  ) {
    return this.promptsService.assignAlias(p.user_id, prompt, env, b);
  }

  @Get(':prompt_id/aliases')
  aliases(
    @CurrentPrincipal() p: Principal,
    @Param('prompt_id', uuidPipe) prompt: string,
  ) {
    return this.promptsService.aliases(p.user_id, prompt);
  }

  @Post(':prompt_id/versions/:version_id/playground')
  playground(
    @CurrentPrincipal() p: Principal,
    @Param('prompt_id', uuidPipe) prompt: string,
    @Param('version_id', uuidPipe) version: string,
    @Body(new ZodPipe(playgroundSchema)) b: PlaygroundRequestDto,
  ) {
    return this.promptsService.playground(p.user_id, prompt, version, b);
  }
}

@Controller('api/v1/applications/:application_id/prompts')
export class AppPromptsController {
  constructor(private readonly service: PromptsService) {}

  @Post()
  prompt(
    @CurrentPrincipal() p: Principal,
    @Param('application_id', uuidPipe) app: string,
    @Body(new ZodPipe(appPromptSchema)) b: AppPromptRequestDto,
  ) {
    return this.service.newPrompt(p.user_id, app, b);
  }

  @Get()
  prompts(
    @CurrentPrincipal() p: Principal,
    @Param('application_id', uuidPipe) app: string,
  ) {
    return this.service.appPrompts(p.user_id, app);
  }
}
