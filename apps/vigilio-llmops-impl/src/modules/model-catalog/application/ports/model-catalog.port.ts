export const MODEL_CATALOG_REPOSITORY_PORT = Symbol(
  'MODEL_CATALOG_REPOSITORY_PORT',
);

export interface ModelCatalogRepositoryPort {
  countActiveModels(organizationId: string): Promise<number>;
}
