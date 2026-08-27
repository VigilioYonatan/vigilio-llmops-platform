import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuditService } from '../../../shared/audit.service';
import {
  constantEqual,
  decryptSecret,
  encryptSecret,
  randomToken,
  sha256,
  verifyTotpWithStep,
} from '../../../shared/crypto';
import { Principal } from '../../../shared/http/principal';
import { SQL_PORT, type SqlPort } from '../../../shared/ports/sql.port';
import { isRecentMfaTimestamp } from '../domain/identity-policy';
import { MfaCompleteDto } from '../presentation/http/dto/auth.dto';
import { IdentityService } from './identity.service';
import type {
  SessionCookiesPayload,
  UserProfileView,
} from './ports/identity.port';

@Injectable()
export class IdentityLifecycleService {
  constructor(
    @Inject(SQL_PORT) private readonly db: SqlPort,
    private readonly audit: AuditService,
    private readonly identity: IdentityService,
  ) {}

  async refresh(
    sessionToken: string | undefined,
    csrfCookie: string | undefined,
    csrfHeader: string | string[] | undefined,
  ): Promise<{ refreshed: true; cookies: SessionCookiesPayload }> {
    if (
      !sessionToken ||
      !csrfCookie ||
      typeof csrfHeader !== 'string' ||
      !constantEqual(csrfCookie, csrfHeader)
    ) {
      throw new ForbiddenException('CSRF token required');
    }
    const oldHash = sha256(sessionToken);
    const nextSession = randomToken();
    const nextCsrf = randomToken();

    const result = await this.db.tx(async (client) => {
      const session = await client.query<{
        id: string;
        user_id: string;
        csrf_hash: string;
        disabled_at: Date | null;
      }>(
        `SELECT s.id, s.user_id, s.csrf_hash, u.disabled_at
         FROM user_sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now()
         FOR UPDATE OF s`,
        [oldHash],
      );
      if (!session.rowCount || session.rows[0]?.disabled_at) {
        const replay = await client.query<{ user_id: string }>(
          'SELECT user_id FROM session_rotation_history WHERE token_hash=$1 FOR UPDATE',
          [oldHash],
        );
        if (replay.rowCount) {
          await client.query(
            'UPDATE user_sessions SET revoked_at=now() WHERE user_id=$1',
            [replay.rows[0]?.user_id],
          );
          await client.query(
            'UPDATE session_rotation_history SET replayed_at=now() WHERE token_hash=$1',
            [oldHash],
          );
        }
        return { success: false, replay: Boolean(replay.rowCount) };
      }
      const current = session.rows[0]!;
      if (!constantEqual(current.csrf_hash, sha256(csrfCookie))) {
        throw new ForbiddenException('CSRF mismatch');
      }
      await client.query(
        'INSERT INTO session_rotation_history(session_id,user_id,token_hash) VALUES($1,$2,$3)',
        [current.id, current.user_id, oldHash],
      );
      await client.query(
        'UPDATE user_sessions SET token_hash=$2,csrf_hash=$3 WHERE id=$1',
        [current.id, sha256(nextSession), sha256(nextCsrf)],
      );
      return { success: true, replay: false };
    });

    if (!result.success) {
      throw new UnauthorizedException(
        result.replay
          ? 'Session replay detected; sessions revoked'
          : 'Expired session',
      );
    }
    return {
      refreshed: true,
      cookies: { session: nextSession, csrf: nextCsrf },
    };
  }

  async completeMfa(
    b: MfaCompleteDto,
  ): Promise<{ user: UserProfileView; cookies: SessionCookiesPayload }> {
    const hash = sha256(b.challenge_token);
    const userId = await this.db.tx(async (client) => {
      const ch = await client.query<{ user_id: string }>(
        'UPDATE mfa_login_challenges SET consumed_at=now() WHERE challenge_hash=$1 AND consumed_at IS NULL AND expires_at>now() RETURNING user_id',
        [hash],
      );
      if (!ch.rowCount)
        throw new UnauthorizedException('Challenge unavailable');
      const uid = ch.rows[0]?.user_id;
      if (!uid) {
        throw new UnauthorizedException('Challenge unavailable');
      }
      const activeUser = await client.query<{ id: string }>(
        'SELECT id FROM users WHERE id=$1 AND disabled_at IS NULL',
        [uid],
      );
      if (!activeUser.rowCount)
        throw new UnauthorizedException('Account disabled');

      const factor = await client.query<{
        secret_ciphertext: string;
        last_step: string | null;
      }>(
        'SELECT secret_ciphertext,last_step FROM mfa_factors WHERE user_id=$1 AND activated_at IS NOT NULL FOR UPDATE',
        [uid],
      );
      if (!factor.rowCount) throw new UnauthorizedException();
      if (b.recovery_code) {
        const used = await client.query(
          'UPDATE mfa_recovery_codes SET used_at=now() WHERE user_id=$1 AND code_hash=$2 AND used_at IS NULL RETURNING user_id',
          [uid, sha256(b.recovery_code)],
        );
        if (!used.rowCount)
          throw new UnauthorizedException('Invalid recovery code');
      } else {
        const cipherText = factor.rows[0]?.secret_ciphertext;
        if (!cipherText)
          throw new UnauthorizedException('MFA factor corrupted');
        const secret = Buffer.from(decryptSecret(cipherText), 'base64url');
        const check = verifyTotpWithStep(secret, b.totp!);
        const prevStep =
          factor.rows[0]?.last_step === null
            ? null
            : Number(factor.rows[0]?.last_step);
        if (
          !check.valid ||
          check.matchedStep === null ||
          (prevStep !== null && check.matchedStep <= prevStep)
        ) {
          throw new UnauthorizedException('Invalid TOTP');
        }
        await client.query(
          'UPDATE mfa_factors SET last_step=$2 WHERE user_id=$1',
          [uid, check.matchedStep],
        );
      }
      return uid;
    });

    const cookies = await this.identity.createSessionTokens(userId, true);
    const profile = await this.identity.currentUser(userId);
    await this.audit.write(
      'identity.mfa_login_completed',
      userId,
      null,
      'user',
      userId,
    );
    return { user: profile, cookies };
  }

  private async verifyPassword(userId: string, pass: string): Promise<void> {
    const credential = await this.db.one<{ password_hash: string }>(
      'SELECT password_hash FROM user_credentials WHERE user_id=$1',
      [userId],
    );
    if (!credential || !(await argon2.verify(credential.password_hash, pass))) {
      throw new UnauthorizedException('Reauthentication failed');
    }
  }

  private assertRecentMfa(p: Principal): void {
    if (!isRecentMfaTimestamp(p.mfa_verified_at)) {
      throw new ForbiddenException('Recent MFA required');
    }
  }

  private async assertRecentMfaIfEnabled(p: Principal): Promise<void> {
    const factor = await this.db.one<{ user_id: string }>(
      'SELECT user_id FROM mfa_factors WHERE user_id=$1 AND activated_at IS NOT NULL',
      [p.user_id],
    );
    if (factor) {
      this.assertRecentMfa(p);
    }
  }

  async rotateCodes(p: Principal, password: string) {
    this.assertRecentMfa(p);
    await this.verifyPassword(p.user_id, password);
    const recoveryCodes = Array.from({ length: 8 }, () => randomToken(15));
    await this.db.tx(async (client) => {
      const factor = await client.query(
        'SELECT user_id FROM mfa_factors WHERE user_id=$1 AND activated_at IS NOT NULL FOR UPDATE',
        [p.user_id],
      );
      if (!factor.rowCount) throw new ConflictException('MFA disabled');
      await client.query('DELETE FROM mfa_recovery_codes WHERE user_id=$1', [
        p.user_id,
      ]);
      for (const code of recoveryCodes) {
        await client.query(
          'INSERT INTO mfa_recovery_codes(user_id,code_hash) VALUES($1,$2)',
          [p.user_id, sha256(code)],
        );
      }
    });
    await this.audit.write(
      'mfa.codes_rotated',
      p.user_id,
      null,
      'user',
      p.user_id,
    );
    return { recovery_codes: recoveryCodes };
  }

  async disableMfa(p: Principal, password: string, otp: string) {
    this.assertRecentMfa(p);
    await this.verifyPassword(p.user_id, password);
    await this.db.tx(async (client) => {
      const factor = await client.query<{
        secret_ciphertext: string;
        last_step: string | null;
      }>(
        'SELECT secret_ciphertext, last_step FROM mfa_factors WHERE user_id=$1 AND activated_at IS NOT NULL FOR UPDATE',
        [p.user_id],
      );
      if (!factor.rowCount || !factor.rows[0]?.secret_ciphertext)
        throw new NotFoundException('MFA factor not enabled');
      const secret = Buffer.from(
        decryptSecret(factor.rows[0].secret_ciphertext),
        'base64url',
      );
      const check = verifyTotpWithStep(secret, otp);
      const prevStep =
        factor.rows[0]?.last_step === null
          ? null
          : Number(factor.rows[0]?.last_step);
      if (
        !check.valid ||
        check.matchedStep === null ||
        (prevStep !== null && check.matchedStep <= prevStep)
      ) {
        throw new UnauthorizedException('Invalid code');
      }
      await client.query('DELETE FROM mfa_recovery_codes WHERE user_id=$1', [
        p.user_id,
      ]);
      await client.query('DELETE FROM mfa_factors WHERE user_id=$1', [
        p.user_id,
      ]);
    });
    await this.audit.write('mfa.disabled', p.user_id, null, 'user', p.user_id);
    return { disabled: true };
  }

  async changePassword(p: Principal, current: string, next: string) {
    await this.verifyPassword(p.user_id, current);
    if (current === next)
      throw new ConflictException('New password must differ');
    await this.assertRecentMfaIfEnabled(p);
    const hash = await argon2.hash(next, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 3,
      parallelism: 1,
    });
    await this.db.tx(async (client) => {
      await client.query(
        'UPDATE user_credentials SET password_hash=$2 WHERE user_id=$1',
        [p.user_id, hash],
      );
      await client.query(
        'UPDATE user_sessions SET revoked_at=now() WHERE user_id=$1',
        [p.user_id],
      );
    });
    await this.audit.write(
      'identity.password_changed',
      p.user_id,
      null,
      'user',
      p.user_id,
    );
    return { changed: true, signed_out: true };
  }

  async logoutAll(p: Principal) {
    await this.db.rows(
      'UPDATE user_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL',
      [p.user_id],
    );
    return { signed_out_all: true };
  }

  async onboarding(user: string) {
    const profile = await this.identity.currentUser(user);
    const [completed, orgs] = await Promise.all([
      this.db.one('SELECT user_id FROM user_onboarding WHERE user_id=$1', [
        user,
      ]),
      this.db.one<{ total: number }>(
        'SELECT count(*)::int AS total FROM memberships WHERE user_id=$1',
        [user],
      ),
    ]);
    return {
      email_verified: profile.email_verified,
      has_organization: (orgs?.total ?? 0) > 0,
      completed: Boolean(completed),
    };
  }

  async completeOnboarding(user: string) {
    const o = await this.onboarding(user);
    if (!o.email_verified || !o.has_organization) {
      throw new ConflictException(
        'Verify email and join or create an organization first',
      );
    }
    await this.db.rows(
      'INSERT INTO user_onboarding(user_id) VALUES($1) ON CONFLICT DO NOTHING',
      [user],
    );
    return { completed: true };
  }

  async changeEmail(p: Principal, nextEmail: string, password: string) {
    await this.assertRecentMfaIfEnabled(p);
    await this.verifyPassword(p.user_id, password);
    const now = await this.identity.currentUser(p.user_id);
    if (now.email === nextEmail)
      throw new ConflictException('Email already active');
    const duplicate = await this.db.one('SELECT id FROM users WHERE email=$1', [
      nextEmail,
    ]);
    if (duplicate) throw new ConflictException('Email unavailable');
    const token = randomToken();
    await this.db.tx(async (client) => {
      await client.query('DELETE FROM email_change_tokens WHERE user_id=$1', [
        p.user_id,
      ]);
      await client.query(
        "INSERT INTO email_change_tokens(user_id,next_email,token_hash,expires_at) VALUES($1,$2,$3,now()+interval '30 minutes')",
        [p.user_id, nextEmail, sha256(token)],
      );
      await client.query(
        "INSERT INTO outbox_events(topic,payload) VALUES('email.change',$1)",
        [
          JSON.stringify({
            email: nextEmail,
            token_encrypted: encryptSecret(token),
            user_id: p.user_id,
          }),
        ],
      );
    });
    return { verification_required: true };
  }

  async verifyEmailChange(principal: Principal, token: string) {
    const user = principal.user_id;
    const changed = await this.db.tx(async (client) => {
      const row = await client.query<{ next_email: string }>(
        'UPDATE email_change_tokens SET consumed_at=now() WHERE user_id=$1 AND token_hash=$2 AND consumed_at IS NULL AND expires_at>now() RETURNING next_email',
        [user, sha256(token)],
      );
      if (!row.rowCount)
        throw new UnauthorizedException('Invalid email verification token');
      const email = row.rows[0]?.next_email;
      await client.query(
        'UPDATE users SET email=$2,email_verified=true WHERE id=$1',
        [user, email],
      );
      await client.query(
        'UPDATE user_sessions SET revoked_at=now() WHERE user_id=$1 AND id<>$2',
        [user, principal.session_id],
      );
      return email;
    });
    await this.audit.write('identity.email_changed', user, null, 'user', user);
    return { changed: true, email: changed };
  }
}
