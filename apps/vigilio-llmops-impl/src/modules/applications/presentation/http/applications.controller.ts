import {
  Body,
  Controller,
  Delete,
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
import { ApplicationsService } from '../../application/applications.service';
import {
  appCreateSchema,
  createScopedAppSchema,
  credentialSchema,
  environmentSchema,
  keyCreateSchema,
  patchAppSchema,
} from './dto/application.dto';

const id = z.uuid();

@Controller('api/v1/applications')
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Post()
  create(
    @CurrentPrincipal() principal: Principal,
    @Body(new ZodPipe(appCreateSchema)) body: z.infer<typeof appCreateSchema>,
  ) {
    return this.applicationsService.create(principal.user_id, body);
  }

  @Get()
  list(
    @CurrentPrincipal() principal: Principal,
    @Query('workspace_id', new ZodPipe(id)) workspaceId: string,
  ) {
    return this.applicationsService.list(principal.user_id, workspaceId);
  }

  @Get(':app_id')
  get(
    @CurrentPrincipal() principal: Principal,
    @Param('app_id', new ZodPipe(id)) appId: string,
  ) {
    return this.applicationsService.get(principal.user_id, appId);
  }

  @Patch(':app_id')
  patch(
    @CurrentPrincipal() p: Principal,
    @Param('app_id', new ZodPipe(id)) appId: string,
    @Body(new ZodPipe(patchAppSchema)) b: z.infer<typeof patchAppSchema>,
  ) {
    return this.applicationsService.patch(p.user_id, appId, b.name);
  }

  @Post(':app_id/environments')
  addEnvironment(
    @CurrentPrincipal() p: Principal,
    @Param('app_id', new ZodPipe(id)) appId: string,
    @Body(new ZodPipe(environmentSchema)) b: z.infer<typeof environmentSchema>,
  ) {
    return this.applicationsService.addEnvironment(p.user_id, appId, b.name);
  }

  @Get(':app_id/environments')
  environments(
    @CurrentPrincipal() p: Principal,
    @Param('app_id', new ZodPipe(id)) appId: string,
  ) {
    return this.applicationsService.environments(p.user_id, appId);
  }

  @Get(':app_id/summary')
  summary(
    @CurrentPrincipal() p: Principal,
    @Param('app_id', new ZodPipe(id)) appId: string,
  ) {
    return this.applicationsService.summary(p.user_id, appId);
  }

  @Post(':app_id/keys')
  key(
    @CurrentPrincipal() principal: Principal,
    @Param('app_id', new ZodPipe(id)) appId: string,
    @Body(new ZodPipe(keyCreateSchema)) body: z.infer<typeof keyCreateSchema>,
  ) {
    return this.applicationsService.createKey(principal.user_id, appId, body);
  }

  @Get(':app_id/keys')
  keys(
    @CurrentPrincipal() principal: Principal,
    @Param('app_id', new ZodPipe(id)) appId: string,
  ) {
    return this.applicationsService.listKeys(principal.user_id, appId);
  }

  @Delete(':app_id/keys/:key_id')
  revoke(
    @CurrentPrincipal() principal: Principal,
    @Param('app_id', new ZodPipe(id)) appId: string,
    @Param('key_id', new ZodPipe(id)) keyId: string,
  ) {
    return this.applicationsService.revokeKey(principal.user_id, appId, keyId);
  }

  @Post(':app_id/sdk-credentials')
  sdkKey(
    @CurrentPrincipal() p: Principal,
    @Param('app_id', new ZodPipe(id)) appId: string,
    @Body(new ZodPipe(credentialSchema)) b: z.infer<typeof credentialSchema>,
  ) {
    return this.applicationsService.createKey(p.user_id, appId, b);
  }

  @Get(':app_id/sdk-credentials')
  sdkKeys(
    @CurrentPrincipal() p: Principal,
    @Param('app_id', new ZodPipe(id)) appId: string,
  ) {
    return this.applicationsService.listKeys(p.user_id, appId);
  }

  @Post(':app_id/sdk-credentials/:credential_id/rotate')
  rotateSdkKey(
    @CurrentPrincipal() p: Principal,
    @Param('app_id', new ZodPipe(id)) appId: string,
    @Param('credential_id', new ZodPipe(id)) credentialId: string,
  ) {
    return this.applicationsService.rotateKey(p.user_id, appId, credentialId);
  }

  @Delete(':app_id/sdk-credentials/:credential_id')
  revokeSdkKey(
    @CurrentPrincipal() p: Principal,
    @Param('app_id', new ZodPipe(id)) appId: string,
    @Param('credential_id', new ZodPipe(id)) credentialId: string,
  ) {
    return this.applicationsService.revokeKey(p.user_id, appId, credentialId);
  }
}

@Controller('api/v1/workspaces')
export class ScopedApplicationsController {
  constructor(private readonly service: ApplicationsService) {}

  @Post(':workspace_id/applications')
  create(
    @CurrentPrincipal() p: Principal,
    @Param('workspace_id', new ZodPipe(id)) ws: string,
    @Body(new ZodPipe(createScopedAppSchema)) b: z.infer<
      typeof createScopedAppSchema
    >,
  ) {
    return this.service.createScoped(p.user_id, ws, b);
  }

  @Get(':workspace_id/applications')
  list(
    @CurrentPrincipal() p: Principal,
    @Param('workspace_id', new ZodPipe(id)) ws: string,
  ) {
    return this.service.list(p.user_id, ws);
  }
}
