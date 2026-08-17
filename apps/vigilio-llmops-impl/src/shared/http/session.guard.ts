import { createHash } from 'node:crypto';
import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { cookieNames } from '../config';
import { constantEqual } from '../crypto';
import { SQL_PORT, type SqlPort } from '../ports/sql.port';
import { API_KEY_METADATA } from './api-key.decorator';
import type { AuthenticatedRequest, Principal } from './principal';
import { PUBLIC_METADATA } from './public.decorator';

type SessionRow = Principal & {
  expires_at: Date;
  revoked_at: Date | null;
  disabled_at: Date | null;
};

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(SQL_PORT) private readonly databaseService: SqlPort,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (
      this.reflector.getAllAndOverride<boolean>(PUBLIC_METADATA, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      return true;
    }

    const apiScope = this.reflector.getAllAndOverride<string>(
      API_KEY_METADATA,
      [context.getHandler(), context.getClass()],
    );
    if (apiScope) {
      const authorization = request.headers.authorization ?? '';
      if (!authorization.startsWith('Bearer vgl_')) {
        throw new UnauthorizedException();
      }
      const hash = createHash('sha256')
        .update(authorization.slice(7))
        .digest('hex');
      const row = await this.databaseService.one<{
        id: string;
        organization_id: string;
        workspace_id: string;
        scopes: string[];
      }>(
        'SELECT a.id,a.organization_id,a.workspace_id,k.scopes FROM application_keys k JOIN applications a ON a.id=k.application_id WHERE k.token_hash=$1 AND k.revoked_at IS NULL AND (k.expires_at IS NULL OR k.expires_at>now()) AND a.archived_at IS NULL',
        [hash],
      );
      if (!row || !row.scopes.includes(apiScope)) {
        throw new ForbiddenException('Invalid API key or scope');
      }
      request.application = row;
      return true;
    }

    const token = request.cookies?.[cookieNames.session] as string | undefined;
    if (!token) throw new UnauthorizedException();
    const hash = createHash('sha256').update(token).digest('hex');
    const session = await this.databaseService.one<SessionRow>(
      'SELECT s.id AS session_id, s.user_id, s.csrf_hash, s.mfa_verified_at, s.expires_at, s.revoked_at, u.disabled_at FROM user_sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1',
      [hash],
    );
    if (
      !session ||
      session.revoked_at ||
      session.disabled_at ||
      new Date(session.expires_at).getTime() < Date.now()
    ) {
      throw new UnauthorizedException();
    }

    const isMutation = !['GET', 'HEAD', 'OPTIONS'].includes(
      request.method.toUpperCase(),
    );
    if (isMutation) {
      const csrfCookie = request.cookies?.[cookieNames.csrf] as
        | string
        | undefined;
      const csrfHeader = request.headers['x-csrf-token'];
      if (
        !csrfCookie ||
        typeof csrfHeader !== 'string' ||
        !constantEqual(csrfCookie, csrfHeader) ||
        !constantEqual(
          createHash('sha256').update(csrfCookie).digest('hex'),
          session.csrf_hash,
        )
      ) {
        throw new ForbiddenException('CSRF validation failed');
      }
    }

    request.principal = {
      session_id: session.session_id,
      user_id: session.user_id,
      csrf_hash: session.csrf_hash,
      mfa_verified_at: session.mfa_verified_at,
    };
    return true;
  }
}
