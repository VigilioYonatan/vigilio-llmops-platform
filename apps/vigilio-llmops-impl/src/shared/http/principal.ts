import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
export type Principal = {
  user_id: string;
  session_id: string;
  csrf_hash: string;
  mfa_verified_at: Date | null;
};
export type AuthenticatedRequest = Request & {
  principal?: Principal;
  application?: {
    id: string;
    organization_id: string;
    workspace_id: string;
    scopes: string[];
  };
};
export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Principal => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.principal)
      throw new Error('Authentication guard did not populate principal');
    return request.principal;
  },
);
