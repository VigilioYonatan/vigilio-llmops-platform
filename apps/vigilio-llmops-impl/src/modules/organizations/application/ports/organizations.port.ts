export const ORGANIZATIONS_REPOSITORY_PORT = Symbol(
  'ORGANIZATIONS_REPOSITORY_PORT',
);

export interface OrganizationsRepositoryPort {
  countUserOrganizations(userId: string): Promise<number>;
}
