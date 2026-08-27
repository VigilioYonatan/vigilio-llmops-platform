import type { Response } from 'express';
import { config, cookieNames } from '../../../../shared/config';
import type { SessionCookiesPayload } from '../../application/ports/identity.port';

const SESSION_TTL_MS = 7 * 86_400_000;
const OAUTH_TTL_MS = 10 * 60_000;

function cookieOptions(httpOnly: boolean, maxAge: number) {
  return {
    httpOnly,
    secure: config.SESSION_COOKIE_SECURE === 'true',
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  };
}

export function applySessionCookies(
  response: Response,
  cookies: SessionCookiesPayload,
): void {
  response.cookie(
    cookieNames.session,
    cookies.session,
    cookieOptions(true, SESSION_TTL_MS),
  );
  response.cookie(
    cookieNames.csrf,
    cookies.csrf,
    cookieOptions(false, SESSION_TTL_MS),
  );
}

export function clearSessionCookies(response: Response): void {
  response.clearCookie(cookieNames.session, cookieOptions(true, 0));
  response.clearCookie(cookieNames.csrf, cookieOptions(false, 0));
}

export function applyOauthCookie(response: Response, token: string): void {
  response.cookie(cookieNames.oauth, token, cookieOptions(true, OAUTH_TTL_MS));
}

export function clearOauthCookie(response: Response): void {
  response.clearCookie(cookieNames.oauth, cookieOptions(true, 0));
}
