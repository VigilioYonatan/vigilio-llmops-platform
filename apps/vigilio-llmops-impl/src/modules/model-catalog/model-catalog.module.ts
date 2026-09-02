import './presentation/http/doc/model-catalog.doc';
import { Module } from '@nestjs/common';
import { ModelCatalogService } from './application/model-catalog.service';
import { MODEL_CATALOG_REPOSITORY_PORT } from './application/ports/model-catalog.port';
import { ModelCatalogDrizzleRepository } from './infrastructure/persistence/drizzle/model-catalog.repository';
import {
  ModelRoutesController,
  ModelsController,
  ProvidersController,
} from './presentation/http/model-catalog.controller';

@Module({
  controllers: [ModelsController, ModelRoutesController, ProvidersController],
  providers: [
    ModelCatalogService,
    ModelCatalogDrizzleRepository,
    {
      provide: MODEL_CATALOG_REPOSITORY_PORT,
      useExisting: ModelCatalogDrizzleRepository,
    },
  ],
  exports: [ModelCatalogService],
})
export class ModelCatalogModule {}
