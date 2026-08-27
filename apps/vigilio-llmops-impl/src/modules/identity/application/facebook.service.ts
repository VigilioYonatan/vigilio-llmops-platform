import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { z } from 'zod';
import { AuditService } from '../../../shared/audit.service';
import { config } from '../../../shared/config';
import {
  decryptSecret,
  encryptSecret,
  randomToken,
  sha256,
} from '../../../shared/crypto';
import { Principal } from '../../../shared/http/principal';
import { SQL_PORT, type SqlPort } from '../../../shared/ports/sql.port';
import {
  isRecentMfaTimestamp,
  sanitizeReturnPath,
  verifyMetaSignedRequestRaw,
} from '../domain/identity-policy';
import { IdentityService } from './identity.service';
import type { SessionCookiesPayload } from './ports/identity.port';

const tokenSchema = z.object({
  access_token: z.string().min(4),
  token_type: z.string().optional(),
});
const profileSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  email: z.string().optional(),
});

export function returnPath(input: unknown): string {
  return sanitizeReturnPath(input);
}

export function decodeSignedRequest(
  signed_request: string,
  secret: string,
  now = Date.now(),
): { user_id: string; issued_at: number } {
  const verified = verifyMetaSignedRequestRaw(signed_request, secret, now);
  if (!verified.ok) {
    throw new ForbiddenException(verified.reason);
  }
  return { user_id: verified.user_id, issued_at: verified.issued_at };
}

@Injectable()
export class FacebookService {
  constructor(
    @Inject(SQL_PORT) private readonly databaseService: SqlPort,
    private readonly identityService: IdentityService,
    private readonly auditService: AuditService,
  ) {}

  private credentials() {
    if (!config.FACEBOOK_APP_ID || !config.FACEBOOK_APP_SECRET) {
      throw new ServiceUnavailableException('Facebook Login is not configured');
    }
    return {
      app_id: config.FACEBOOK_APP_ID,
      secret: config.FACEBOOK_APP_SECRET,
    };
  }

  private async assertMfaIfEnabled(principal: Principal): Promise<void> {
    const factor = await this.databaseService.one<{ user_id: string }>(
      'SELECT user_id FROM mfa_factors WHERE user_id=$1 AND activated_at IS NOT NULL',
      [principal.user_id],
    );
    if (factor && !isRecentMfaTimestamp(principal.mfa_verified_at)) {
      throw new ForbiddenException('Recent MFA required');
    }
  }

  async begin(
    return_to: unknown,
    principal: Principal | null = null,
  ): Promise<{ authorization_url: string; oauth_cookie: string }> {
    const { app_id } = this.credentials();
    if (principal) {
      await this.assertMfaIfEnabled(principal);
    }
    const state = randomToken();
    const cookie = randomToken();
    const safeReturn = returnPath(return_to);
    await this.databaseService.rows(
      "INSERT INTO oauth_transactions(state_hash,cookie_hash,return_to,action,initiating_user_id,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval '10 minutes')",
      [
        sha256(state),
        sha256(cookie),
        safeReturn,
        principal ? 'link' : 'login',
        principal?.user_id ?? null,
      ],
    );
    const redirectUri = `${config.APP_ORIGIN}/api/v1/auth/facebook/callback`;
    const url = new URL(
      `https://www.facebook.com/${config.FACEBOOK_GRAPH_VERSION}/dialog/oauth`,
    );
    url.searchParams.set('client_id', app_id);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('state', state);
    url.searchParams.set('scope', 'public_profile,email');
    url.searchParams.set('response_type', 'code');
    return { authorization_url: url.toString(), oauth_cookie: cookie };
  }

  async callback(
    cookie: string | undefined,
    state: unknown,
    code: unknown,
    error: unknown,
  ): Promise<{ redirect_to: string; cookies?: SessionCookiesPayload }> {
    const { app_id, secret } = this.credentials();
    if (error) throw new ForbiddenException('Facebook authorization denied');
    if (!cookie || typeof state !== 'string' || typeof code !== 'string') {
      throw new ForbiddenException('Invalid OAuth callback');
    }
    const transaction = await this.databaseService.one<{
      id: string;
      return_to: string;
      action: string;
      initiating_user_id: string | null;
    }>(
      'UPDATE oauth_transactions SET consumed_at=now() WHERE state_hash=$1 AND cookie_hash=$2 AND consumed_at IS NULL AND expires_at>now() RETURNING id,return_to,action,initiating_user_id',
      [sha256(state), sha256(cookie)],
    );
    if (!transaction)
      throw new ForbiddenException('OAuth state expired or replayed');

    const uri = `${config.APP_ORIGIN}/api/v1/auth/facebook/callback`;
    const tokenUrl = new URL(
      `https://graph.facebook.com/${config.FACEBOOK_GRAPH_VERSION}/oauth/access_token`,
    );
    tokenUrl.searchParams.set('client_id', app_id);
    tokenUrl.searchParams.set('client_secret', secret);
    tokenUrl.searchParams.set('redirect_uri', uri);
    tokenUrl.searchParams.set('code', code);

    let subject: string;
    let displayName: string;
    try {
      const res = await fetch(tokenUrl, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error('Facebook token exchange failed');
      const token = tokenSchema.parse(await res.json()).access_token;
      const profileUrl = new URL(
        `https://graph.facebook.com/${config.FACEBOOK_GRAPH_VERSION}/me`,
      );
      profileUrl.searchParams.set('fields', 'id,name');
      profileUrl.searchParams.set('access_token', token);
      const profileResponse = await fetch(profileUrl, {
        signal: AbortSignal.timeout(8000),
      });
      if (!profileResponse.ok) throw new Error('Facebook profile fetch failed');
      const profile = profileSchema.parse(await profileResponse.json());
      subject = profile.id;
      displayName = profile.name ?? 'Facebook user';
    } catch {
      throw new ServiceUnavailableException(
        'Facebook authentication temporarily unavailable',
      );
    }

    const safeTarget = new URL(
      returnPath(transaction.return_to),
      config.WEB_ORIGIN,
    ).toString();

    if (transaction.action === 'link') {
      if (!transaction.initiating_user_id) throw new UnauthorizedException();
      const activeUser = await this.databaseService.one<{ id: string }>(
        'SELECT id FROM users WHERE id=$1 AND disabled_at IS NULL',
        [transaction.initiating_user_id],
      );
      if (!activeUser) throw new ForbiddenException('Account disabled');

      const existing = await this.databaseService.one<{ user_id: string }>(
        'SELECT user_id FROM social_identities WHERE provider=$1 AND subject=$2',
        ['facebook', subject],
      );
      if (existing && existing.user_id !== transaction.initiating_user_id) {
        throw new ConflictException('Facebook account linked to another user');
      }
      await this.databaseService.rows(
        "INSERT INTO social_identities(user_id,provider,subject) VALUES($1,'facebook',$2) ON CONFLICT(provider,subject) DO NOTHING",
        [transaction.initiating_user_id, subject],
      );
      await this.auditService.write(
        'identity.facebook_linked',
        transaction.initiating_user_id,
        null,
        'user',
        transaction.initiating_user_id,
      );
      return { redirect_to: safeTarget };
    }

    const userId = await this.databaseService.tx(async (client) => {
      const existing = await client.query<{
        user_id: string;
        disabled_at: Date | null;
      }>(
        'SELECT s.user_id, u.disabled_at FROM social_identities s JOIN users u ON u.id = s.user_id WHERE s.provider=$1 AND s.subject=$2',
        ['facebook', subject],
      );
      if (existing.rowCount) {
        if (existing.rows[0]?.disabled_at) {
          throw new ForbiddenException('Account is disabled');
        }
        return existing.rows[0]?.user_id;
      }
      // Never auto-link Facebook by e-mail. Provider subject is the only social identity key.
      const generatedEmail = `fb-${sha256(subject).slice(0, 40)}@social.invalid`;
      const inserted = await client.query<{ id: string }>(
        'INSERT INTO users(email,display_name,email_verified) VALUES($1,$2,false) RETURNING id',
        [generatedEmail, displayName],
      );
      const createdUserId = inserted.rows[0]?.id;
      if (!createdUserId) {
        throw new Error('Failed to create user record');
      }
      await client.query(
        "INSERT INTO social_identities(user_id,provider,subject) VALUES($1,'facebook',$2)",
        [createdUserId, subject],
      );
      await client.query(
        'INSERT INTO consent_receipts(user_id,document_version,subject_hash) VALUES($1,$2,$3)',
        [
          createdUserId,
          'oauth-facebook-v1',
          sha256(`facebook:${subject}:${createdUserId}`),
        ],
      );
      return createdUserId;
    });

    if (!userId) {
      throw new Error('Unable to resolve user identity');
    }

    // Enforce second factor when active on the user account — never let social OAuth bypass MFA.
    const activeMfa = await this.databaseService.one<{ user_id: string }>(
      'SELECT user_id FROM mfa_factors WHERE user_id=$1 AND activated_at IS NOT NULL',
      [userId],
    );
    if (activeMfa) {
      const challenge = randomToken();
      await this.databaseService.rows(
        "INSERT INTO mfa_login_challenges(user_id,challenge_hash,expires_at) VALUES($1,$2,now()+interval '5 minutes')",
        [userId, sha256(challenge)],
      );
      const mfaRedirect = new URL('/auth/login', config.WEB_ORIGIN);
      mfaRedirect.searchParams.set('mfa_challenge', challenge);
      mfaRedirect.searchParams.set(
        'return_to',
        returnPath(transaction.return_to),
      );
      return { redirect_to: mfaRedirect.toString() };
    }

    const cookies = await this.identityService.createSessionTokens(
      userId,
      false,
    );
    await this.auditService.write(
      'identity.facebook_login',
      userId,
      null,
      'user',
      userId,
    );
    return { redirect_to: safeTarget, cookies };
  }

  async deletionWebhook(
    signed_request: string,
  ): Promise<{ url: string; confirmation_code: string }> {
    const { secret } = this.credentials();
    const decoded = decodeSignedRequest(signed_request, secret);
    const lockKey = sha256(`facebook:${decoded.user_id}`);
    const code = await this.databaseService.tx(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        lockKey,
      ]);
      const identity = await client.query<{ id: string }>(
        "SELECT id FROM social_identities WHERE provider='facebook' AND subject=$1",
        [decoded.user_id],
      );
      const identityId = identity.rows[0]?.id ?? null;

      // Return identical confirmation code on repeated Meta webhook deliveries for the same pending/active link
      const existingActive = identityId
        ? await client.query<{ confirmation_ciphertext: string }>(
            'SELECT confirmation_ciphertext FROM deletion_requests WHERE identity_id=$1 ORDER BY created_at DESC LIMIT 1',
            [identityId],
          )
        : await client.query<{ confirmation_ciphertext: string }>(
            'SELECT confirmation_ciphertext FROM deletion_requests WHERE request_hash=$1',
            [lockKey],
          );
      if (
        existingActive.rowCount &&
        existingActive.rows[0]?.confirmation_ciphertext
      ) {
        return decryptSecret(existingActive.rows[0].confirmation_ciphertext);
      }

      const requestHash = identityId
        ? sha256(`facebook:${decoded.user_id}:${identityId}`)
        : lockKey;
      const generatedCode = randomToken(24);
      await client.query(
        'INSERT INTO deletion_requests(identity_id,request_hash,confirmation_hash,confirmation_ciphertext,status,completed_at) VALUES($1,$2,$3,$4,$5,$6)',
        [
          identityId,
          requestHash,
          sha256(generatedCode),
          encryptSecret(generatedCode),
          identityId ? 'queued' : 'completed',
          identityId ? null : new Date(),
        ],
      );
      if (identityId) {
        await client.query(
          "INSERT INTO outbox_events(topic,payload) VALUES('privacy.facebook.delete',$1)",
          [JSON.stringify({ identity_id: identityId })],
        );
      }
      await client.query(
        'INSERT INTO audit_events(action,actor_id,organization_id,resource_type,resource_id,metadata) VALUES($1,NULL,NULL,$2,$3,$4)',
        [
          'privacy.facebook_deletion_requested',
          'facebook_subject',
          sha256(decoded.user_id).slice(0, 24),
          JSON.stringify({ matched_identity: Boolean(identityId) }),
        ],
      );
      return generatedCode;
    });
    return {
      url: `${config.APP_ORIGIN}/api/v1/privacy/deletion-status/${encodeURIComponent(code)}`,
      confirmation_code: code,
    };
  }

  async deletionStatus(
    code: string,
  ): Promise<{ status: string; confirmation_code: string }> {
    const row = await this.databaseService.one<{ status: string }>(
      'SELECT status FROM deletion_requests WHERE confirmation_hash=$1',
      [sha256(code)],
    );
    return { status: row?.status ?? 'unavailable', confirmation_code: code };
  }

  async listIdentities(userId: string) {
    return this.databaseService.rows(
      'SELECT provider,created_at FROM social_identities WHERE user_id=$1',
      [userId],
    );
  }

  async unlink(principal: Principal) {
    await this.assertMfaIfEnabled(principal);
    const credential = await this.databaseService.one(
      'SELECT user_id FROM user_credentials WHERE user_id=$1',
      [principal.user_id],
    );
    if (!credential) {
      throw new ForbiddenException(
        'Cannot unlink your last authentication method',
      );
    }
    await this.databaseService.rows(
      "DELETE FROM social_identities WHERE user_id=$1 AND provider='facebook'",
      [principal.user_id],
    );
    await this.auditService.write(
      'identity.facebook_unlinked',
      principal.user_id,
      null,
      'user',
      principal.user_id,
    );
    return { unlinked: true };
  }
}
