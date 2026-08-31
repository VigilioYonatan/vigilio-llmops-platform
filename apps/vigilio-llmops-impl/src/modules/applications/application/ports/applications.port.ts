export const APPLICATIONS_REPOSITORY_PORT = Symbol(
  'APPLICATIONS_REPOSITORY_PORT',
);

export interface ApplicationsRepositoryPort {
  countActiveKeys(applicationId: string): Promise<number>;
}
