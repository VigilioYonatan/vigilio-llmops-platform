import { Module } from '@nestjs/common';
import { DatasetLifecycleService } from './application/dataset-lifecycle.service';
import { DatasetsService } from './application/datasets.service';
import { DATASETS_REPOSITORY } from './application/ports/datasets.port';
import { DatasetsDrizzleRepository } from './infrastructure/persistence/drizzle/datasets.repository';
import {
  AppDatasetsController,
  DatasetImportStatusController,
  DatasetsController,
} from './presentation/http/datasets.controller';
import { registerDatasetsDocs } from './presentation/http/doc/datasets.doc';

registerDatasetsDocs();

@Module({
  controllers: [
    DatasetsController,
    AppDatasetsController,
    DatasetImportStatusController,
  ],
  providers: [
    DatasetsService,
    DatasetLifecycleService,
    {
      provide: DATASETS_REPOSITORY,
      useClass: DatasetsDrizzleRepository,
    },
  ],
  exports: [DatasetsService, DatasetLifecycleService],
})
export class DatasetsModule {}
