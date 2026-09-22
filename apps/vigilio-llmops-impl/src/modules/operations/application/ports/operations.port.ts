export interface AlertRuleRecord {
  id: string;
  organization_id: string;
  workspace_id: string;
  name: string;
  metric: string;
  comparator: string;
  threshold: string;
  enabled: boolean;
  runbook_url: string;
}

export const OPERATIONS_REPOSITORY = Symbol('OPERATIONS_REPOSITORY');

export interface OperationsRepository {
  findRule(id: string): Promise<AlertRuleRecord | null>;
}
