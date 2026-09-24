export interface AuditEventRecord {
  id: number;
  organization_id: string;
  actor_id: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
}

export const GOVERNANCE_REPOSITORY = Symbol('GOVERNANCE_REPOSITORY');

export interface GovernanceRepository {
  findAuditEvent(id: number): Promise<AuditEventRecord | null>;
}
