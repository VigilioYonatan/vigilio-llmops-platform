import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/http';
import type { Organization, User, Workspace } from './types';
export const useCurrentUser = () =>
  useQuery({
    queryKey: ['me'],
    queryFn: () => api<User>('/me'),
    retry: false,
    staleTime: 60000,
  });
export const useOrganizations = () =>
  useQuery({
    queryKey: ['organizations'],
    queryFn: () => api<Organization[]>('/organizations'),
    retry: false,
  });
export const useWorkspaces = (organization_id: string | null) =>
  useQuery({
    queryKey: ['workspaces', organization_id],
    enabled: Boolean(organization_id),
    queryFn: () =>
      api<Workspace[]>(`/organizations/${organization_id}/workspaces`),
  });
export const useInvalidate = () => useQueryClient();
