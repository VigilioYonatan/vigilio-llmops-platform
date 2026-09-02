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
import { ModelCatalogService } from '../../application/model-catalog.service';
import {
  modelCreateSchema,
  providerCreateSchema,
  providerPatchSchema,
  routeCreateSchema,
  routePatchSchema,
} from './dto/model-catalog.dto';

const uuid = z.uuid();
@Controller('api/v1/providers')
export class ProvidersController {
  constructor(private readonly service: ModelCatalogService) {}
  @Post() create(
    @CurrentPrincipal() p: Principal,
    @Body(new ZodPipe(providerCreateSchema)) b: z.infer<
      typeof providerCreateSchema
    >,
  ) {
    return this.service.createProvider(p.user_id, b);
  }
  @Get() list(
    @CurrentPrincipal() p: Principal,
    @Query('organization_id', new ZodPipe(uuid)) org: string,
  ) {
    return this.service.providers(p.user_id, org);
  }
  @Patch(':provider_id') update(
    @CurrentPrincipal() p: Principal,
    @Param('provider_id', new ZodPipe(uuid)) id: string,
    @Body(new ZodPipe(providerPatchSchema)) b: z.infer<
      typeof providerPatchSchema
    >,
  ) {
    return this.service.patchProvider(p.user_id, id, b);
  }
  @Post(':provider_id/verify') verify(
    @CurrentPrincipal() p: Principal,
    @Param('provider_id', new ZodPipe(uuid)) id: string,
  ) {
    return this.service.verifyProvider(p.user_id, id);
  }
}
@Controller('api/v1/models')
export class ModelsController {
  constructor(private readonly service: ModelCatalogService) {}
  @Get() list(
    @CurrentPrincipal() p: Principal,
    @Query('organization_id', new ZodPipe(uuid)) org: string,
  ) {
    return this.service.models(p.user_id, org);
  }
  @Post() create(
    @CurrentPrincipal() p: Principal,
    @Body(new ZodPipe(modelCreateSchema)) b: z.infer<typeof modelCreateSchema>,
  ) {
    return this.service.createModel(p.user_id, b);
  }
  @Get(':model_id') get(
    @CurrentPrincipal() p: Principal,
    @Param('model_id', new ZodPipe(uuid)) id: string,
  ) {
    return this.service.getModel(p.user_id, id);
  }
}
@Controller('api/v1/model-routes')
export class ModelRoutesController {
  constructor(private readonly service: ModelCatalogService) {}
  @Post() create(
    @CurrentPrincipal() p: Principal,
    @Body(new ZodPipe(routeCreateSchema)) b: z.infer<typeof routeCreateSchema>,
  ) {
    return this.service.createRoute(p.user_id, b);
  }
  @Get() list(
    @CurrentPrincipal() p: Principal,
    @Query('application_id', new ZodPipe(uuid)) app: string,
  ) {
    return this.service.routes(p.user_id, app);
  }
  @Patch(':route_id') update(
    @CurrentPrincipal() p: Principal,
    @Param('route_id', new ZodPipe(uuid)) id: string,
    @Body(new ZodPipe(routePatchSchema)) b: z.infer<typeof routePatchSchema>,
  ) {
    return this.service.patchRoute(p.user_id, id, b);
  }
  @Post(':route_id/validate') validate(
    @CurrentPrincipal() p: Principal,
    @Param('route_id', new ZodPipe(uuid)) id: string,
  ) {
    return this.service.validateRoute(p.user_id, id);
  }
}
