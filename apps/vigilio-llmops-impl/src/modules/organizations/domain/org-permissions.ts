import type { Role } from '../../../shared/tenancy.service';

export const ORG_ROLE_PERMISSIONS: Record<Role, readonly string[]> = {
  owner: ['*'],
  admin: [
    'org:edit',
    'org:invite',
    'member:manage',
    'workspace:write',
    'application:write',
    'model:write',
    'prompt:write',
    'dataset:write',
    'evaluation:write',
    'knowledge:write',
    'budget:write',
    'operations:write',
    'audit:read',
  ],
  developer: [
    'application:write',
    'model:write',
    'prompt:write',
    'dataset:write',
    'evaluation:write',
    'release:write',
    'knowledge:write',
    'operations:write',
  ],
  approver: [
    'release:verify',
    'release:approve',
    'evaluation:review',
    'operations:resolve',
    'audit:read',
  ],
  analyst: [
    'telemetry:read',
    'finops:ledger',
    'evaluation:review',
    'knowledge:answer',
  ],
  viewer: ['read'],
} as const;
