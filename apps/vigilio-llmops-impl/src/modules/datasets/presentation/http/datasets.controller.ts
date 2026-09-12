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
import { DatasetLifecycleService } from '../../application/dataset-lifecycle.service';
import { DatasetsService } from '../../application/datasets.service';
import {
  type AddDatasetCaseRequestDto,
  type AppDatasetRequestDto,
  addDatasetCaseSchema,
  appDatasetSchema,
  type CasePatchRequestDto,
  type CreateDatasetRequestDto,
  casePatchSchema,
  createDatasetSchema,
  type DatasetImportRequestDto,
  datasetImportSchema,
} from './dto/dataset.dto';

const uuidPipe = new ZodPipe(z.string().uuid());

@Controller('api/v1/datasets')
export class DatasetsController {
  constructor(
    private readonly datasetsService: DatasetsService,
    private readonly lifecycleService: DatasetLifecycleService,
  ) {}

  @Post()
  create(
    @CurrentPrincipal() principal: Principal,
    @Body(new ZodPipe(createDatasetSchema)) body: CreateDatasetRequestDto,
  ) {
    return this.datasetsService.create(principal.user_id, body);
  }

  @Get()
  list(
    @CurrentPrincipal() principal: Principal,
    @Query('workspace_id', uuidPipe) workspace_id: string,
  ) {
    return this.datasetsService.list(principal.user_id, workspace_id);
  }

  @Get(':id')
  get(
    @CurrentPrincipal() principal: Principal,
    @Param('id', uuidPipe) id: string,
  ) {
    return this.datasetsService.get(principal.user_id, id);
  }

  @Post(':id/draft/cases')
  draftAdd(
    @CurrentPrincipal() principal: Principal,
    @Param('id', uuidPipe) id: string,
    @Body(new ZodPipe(addDatasetCaseSchema)) body: AddDatasetCaseRequestDto,
  ) {
    return this.datasetsService.addCase(principal.user_id, id, body);
  }

  @Delete(':id/draft/cases/:case_id')
  draftRemove(
    @CurrentPrincipal() principal: Principal,
    @Param('id', uuidPipe) id: string,
    @Param('case_id', uuidPipe) case_id: string,
  ) {
    return this.datasetsService.removeCase(principal.user_id, id, case_id);
  }

  @Get(':id/cases')
  cases(
    @CurrentPrincipal() principal: Principal,
    @Param('id', uuidPipe) id: string,
  ) {
    return this.datasetsService.cases(principal.user_id, id);
  }

  @Post(':id/cases')
  addCase(
    @CurrentPrincipal() principal: Principal,
    @Param('id', uuidPipe) id: string,
    @Body(new ZodPipe(addDatasetCaseSchema)) body: AddDatasetCaseRequestDto,
  ) {
    return this.datasetsService.addCase(principal.user_id, id, body);
  }

  @Delete(':id/cases/:case_id')
  removeCase(
    @CurrentPrincipal() principal: Principal,
    @Param('id', uuidPipe) id: string,
    @Param('case_id', uuidPipe) case_id: string,
  ) {
    return this.datasetsService.removeCase(principal.user_id, id, case_id);
  }

  @Post(':dataset_id/versions')
  freeze(
    @CurrentPrincipal() p: Principal,
    @Param('dataset_id', uuidPipe) d: string,
  ) {
    return this.lifecycleService.freeze(p.user_id, d);
  }

  @Get(':dataset_id/versions')
  versions(
    @CurrentPrincipal() p: Principal,
    @Param('dataset_id', uuidPipe) d: string,
  ) {
    return this.lifecycleService.versions(p.user_id, d);
  }

  @Get(':dataset_id/versions/:version_id/cases')
  snapshot(
    @CurrentPrincipal() p: Principal,
    @Param('dataset_id', uuidPipe) d: string,
    @Param('version_id', uuidPipe) v: string,
  ) {
    return this.lifecycleService.snapshotCases(p.user_id, d, v);
  }

  @Patch(':dataset_id/draft/cases/:case_id')
  patch(
    @CurrentPrincipal() p: Principal,
    @Param('dataset_id', uuidPipe) d: string,
    @Param('case_id', uuidPipe) c: string,
    @Body(new ZodPipe(casePatchSchema)) b: CasePatchRequestDto,
  ) {
    return this.lifecycleService.patchCase(p.user_id, d, c, b);
  }

  @Post(':dataset_id/imports')
  imports(
    @CurrentPrincipal() p: Principal,
    @Param('dataset_id', uuidPipe) d: string,
    @Body(new ZodPipe(datasetImportSchema)) b: DatasetImportRequestDto,
  ) {
    return this.lifecycleService.importCases(p.user_id, d, b);
  }
}

@Controller('api/v1/applications/:application_id/datasets')
export class AppDatasetsController {
  constructor(private readonly lifecycleService: DatasetLifecycleService) {}

  @Post()
  dataset(
    @CurrentPrincipal() p: Principal,
    @Param('application_id', uuidPipe) app: string,
    @Body(new ZodPipe(appDatasetSchema)) b: AppDatasetRequestDto,
  ) {
    return this.lifecycleService.newDataset(p.user_id, app, b);
  }

  @Get()
  datasets(
    @CurrentPrincipal() p: Principal,
    @Param('application_id', uuidPipe) app: string,
  ) {
    return this.lifecycleService.appDatasets(p.user_id, app);
  }
}

@Controller('api/v1/dataset-imports')
export class DatasetImportStatusController {
  constructor(private readonly lifecycleService: DatasetLifecycleService) {}

  @Get(':import_id')
  get(
    @CurrentPrincipal() p: Principal,
    @Param('import_id', uuidPipe) i: string,
  ) {
    return this.lifecycleService.importStatus(p.user_id, i);
  }
}
