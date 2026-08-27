import { randomBytes } from 'node:crypto';
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
  decryptSecret,
  encryptSecret,
  randomToken,
  sha256,
  verifyTotpWithStep,
} from '../../../shared/crypto';
import type { Principal } from '../../../shared/http/principal';
import { SQL_PORT, type SqlPort } from '../../../shared/ports/sql.port';
import { base32Encode } from '../domain/identity-policy';
import type {
  LoginRequestDto,
  MfaStepUpDto,
  RegisterRequestDto,
} from '../presentation/http/dto/auth.dto';
import type {
  SessionCookiesPayload,
  UserProfileView,
} from './ports/identity.port';

type UserRecord = {
  id: string;
  email: string;
  display_name: string;
  email_verified: boolean;
  password_hash: string | null;
  disabled_at: Date | null;
};

@Injectable()
export class IdentityService {
  constructor(
    @Inject(SQL_PORT) private readonly databaseService: SqlPort,
    private readonly auditService: AuditService,
  ) {}

  async register(body: RegisterRequestDto): Promise<{ message: string }> {
    const passwordHash = await argon2.hash(body.password, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 3,
      parallelism: 1,
    });
    const token = randomToken();
    await this.databaseService.tx(async (client) => {
      const existing = await client.query(
        'SELECT id FROM users WHERE email=$1',
        [body.email],
      );
      if (existing.rowCount)
        throw new ConflictException('Email already registered');
      const created = await client.query<{ id: string }>(
        'INSERT INTO users(email,display_name) VALUES ($1,$2) RETURNING id',
        [body.email, body.display_name],
      );
      const userId = created.rows[0]?.id;
      await client.query(
        'INSERT INTO user_credentials(user_id,password_hash) VALUES ($1,$2)',
        [userId, passwordHash],
      );
      await client.query(
        'INSERT INTO consent_receipts(user_id,document_version,subject_hash) VALUES ($1,$2,$3)',
        [userId, body.consent_version, sha256(`email:${body.email}`)],
      );
      await client.query(
        "INSERT INTO email_tokens(user_id,kind,token_hash,expires_at) VALUES ($1,'verify',$2,now()+interval '1 day')",
        [userId, sha256(token)],
      );
      await client.query(
        "INSERT INTO outbox_events(topic,payload) VALUES ('email.verify',$1)",
        [
          JSON.stringify({
            user_id: userId,
            email: body.email,
            token_encrypted: encryptSecret(token),
          }),
        ],
      );
    });
    return {
      message: 'Account registered. Check your email to verify your address.',
    };
  }

  async emailVerify(token: string): Promise<{ verified: boolean }> {
    const result = await this.databaseService.tx(async (client) => {
      const consumed = await client.query<{ user_id: string }>(
        "UPDATE email_tokens SET consumed_at=now() WHERE token_hash=$1 AND kind='verify' AND consumed_at IS NULL AND expires_at>now() RETURNING user_id",
        [sha256(token)],
      );
      if (!consumed.rowCount) return false;
      await client.query('UPDATE users SET email_verified=true WHERE id=$1', [
        consumed.rows[0]?.user_id,
      ]);
      return true;
    });
    if (!result)
      throw new ForbiddenException('Invalid or expired verification token');
    return { verified: true };
  }

  async resendVerification(email: string): Promise<{ message: string }> {
    const user = await this.databaseService.one<{
      id: string;
      email_verified: boolean;
    }>(
      'SELECT id,email_verified FROM users WHERE email=$1 AND disabled_at IS NULL',
      [email],
    );
    if (user && !user.email_verified) {
      const token = randomToken();
      await this.databaseService.tx(async (client) => {
        await client.query(
          "UPDATE email_tokens SET consumed_at=now() WHERE user_id=$1 AND kind='verify' AND consumed_at IS NULL",
          [user.id],
        );
        await client.query(
          "INSERT INTO email_tokens(user_id,kind,token_hash,expires_at) VALUES ($1,'verify',$2,now()+interval '1 day')",
          [user.id, sha256(token)],
        );
        await client.query(
          "INSERT INTO outbox_events(topic,payload) VALUES ('email.verify',$1)",
          [
            JSON.stringify({
              user_id: user.id,
              email,
              token_encrypted: encryptSecret(token),
            }),
          ],
        );
      });
    }
    return {
      message:
        'If the account exists, verification instructions have been sent.',
    };
  }

  async login(body: LoginRequestDto): Promise<
    | { mfa_required: true; challenge_token: string }
    | {
        mfa_required?: false;
        user: UserProfileView;
        cookies: SessionCookiesPayload;
      }
  > {
    const user = await this.databaseService.one<UserRecord>(
      'SELECT u.id,u.email,u.display_name,u.email_verified,u.disabled_at,c.password_hash FROM users u JOIN user_credentials c ON c.user_id=u.id WHERE u.email=$1',
      [body.email],
    );
    if (
      !user ||
      user.disabled_at ||
      !user.password_hash ||
      !(await argon2.verify(user.password_hash, body.password))
    ) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (!user.email_verified) {
      throw new ForbiddenException('Verify email before signing in');
    }

    const factor = await this.databaseService.one<{
      secret_ciphertext: string;
      activated_at: Date;
      last_step: string | null;
    }>(
      'SELECT secret_ciphertext,activated_at,last_step FROM mfa_factors WHERE user_id=$1 AND activated_at IS NOT NULL',
      [user.id],
    );
    let mfaVerified = false;
    if (factor) {
      if (!body.recovery_code && !body.totp) {
        const challenge = randomToken();
        await this.databaseService.rows(
          "INSERT INTO mfa_login_challenges(user_id,challenge_hash,expires_at) VALUES($1,$2,now()+interval '5 minutes')",
          [user.id, sha256(challenge)],
        );
        return { mfa_required: true, challenge_token: challenge };
      }
      if (body.recovery_code) {
        const used = await this.databaseService.rows(
          'UPDATE mfa_recovery_codes SET used_at=now() WHERE user_id=$1 AND code_hash=$2 AND used_at IS NULL RETURNING user_id',
          [user.id, sha256(body.recovery_code)],
        );
        if (!used.length)
          throw new UnauthorizedException('Invalid recovery code');
      } else {
        if (!body.totp)
          throw new UnauthorizedException('Valid second factor required');
        const secret = Buffer.from(
          decryptSecret(factor.secret_ciphertext),
          'base64url',
        );
        const check = verifyTotpWithStep(secret, body.totp);
        if (!check.valid || check.matchedStep === null) {
          throw new UnauthorizedException('Valid second factor required');
        }
        const claim = await this.databaseService.rows(
          'UPDATE mfa_factors SET last_step=$2 WHERE user_id=$1 AND (last_step IS NULL OR last_step<$2) RETURNING user_id',
          [user.id, check.matchedStep],
        );
        if (!claim.length)
          throw new UnauthorizedException('Second factor already used');
      }
      mfaVerified = true;
    }

    const cookies = await this.createSessionTokens(user.id, mfaVerified);
    await this.auditService.write(
      'identity.login',
      user.id,
      null,
      'user',
      user.id,
    );
    const profile = await this.currentUser(user.id);
    return { user: profile, cookies };
  }

  async createSessionTokens(
    userId: string,
    mfaVerified = false,
  ): Promise<SessionCookiesPayload> {
    const session = randomToken();
    const csrf = randomToken();
    await this.databaseService.rows(
      "INSERT INTO user_sessions(user_id,token_hash,csrf_hash,expires_at,mfa_verified_at) VALUES($1,$2,$3,now()+interval '7 days',$4)",
      [userId, sha256(session), sha256(csrf), mfaVerified ? new Date() : null],
    );
    return { session, csrf };
  }

  async logout(principal: Principal): Promise<{ signed_out: boolean }> {
    await this.databaseService.rows(
      'UPDATE user_sessions SET revoked_at=now() WHERE id=$1 AND user_id=$2',
      [principal.session_id, principal.user_id],
    );
    return { signed_out: true };
  }

  async listSessions(principal: Principal) {
    return this.databaseService.rows(
      'SELECT id,created_at,expires_at,mfa_verified_at FROM user_sessions WHERE user_id=$1 AND revoked_at IS NULL AND expires_at>now() ORDER BY created_at DESC LIMIT 50',
      [principal.user_id],
    );
  }

  async revokeSession(principal: Principal, sessionId: string) {
    const changed = await this.databaseService.rows<{ id: string }>(
      'UPDATE user_sessions SET revoked_at=now() WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL RETURNING id',
      [sessionId, principal.user_id],
    );
    if (!changed.length) throw new NotFoundException();
    return { revoked: true };
  }

  async currentUser(userId: string): Promise<UserProfileView> {
    const user = await this.databaseService.one<UserProfileView>(
      `SELECT u.id,
              u.email,
              u.display_name,
              u.email_verified,
              EXISTS(SELECT 1 FROM mfa_factors m WHERE m.user_id = u.id AND m.activated_at IS NOT NULL) AS mfa_enabled,
              EXISTS(SELECT 1 FROM user_credentials c WHERE c.user_id = u.id) AS has_password
       FROM users u
       WHERE u.id = $1 AND u.disabled_at IS NULL`,
      [userId],
    );
    if (!user) throw new UnauthorizedException();
    return user;
  }

  async patchUser(userId: string, name: string): Promise<UserProfileView> {
    const updated = await this.databaseService.one<{ id: string }>(
      'UPDATE users SET display_name=$1 WHERE id=$2 AND disabled_at IS NULL RETURNING id',
      [name, userId],
    );
    if (!updated) throw new NotFoundException();
    return this.currentUser(userId);
  }

  async forgotPassword(email: string) {
    const user = await this.databaseService.one<{ id: string }>(
      'SELECT id FROM users WHERE email=$1 AND disabled_at IS NULL',
      [email],
    );
    if (user) {
      const token = randomToken();
      await this.databaseService.tx(async (client) => {
        await client.query(
          "UPDATE email_tokens SET consumed_at=now() WHERE user_id=$1 AND kind='reset' AND consumed_at IS NULL",
          [user.id],
        );
        await client.query(
          "INSERT INTO email_tokens(user_id,kind,token_hash,expires_at) VALUES($1,'reset',$2,now()+interval '30 minutes')",
          [user.id, sha256(token)],
        );
        await client.query(
          "INSERT INTO outbox_events(topic,payload) VALUES('email.reset',$1)",
          [
            JSON.stringify({
              user_id: user.id,
              email,
              token_encrypted: encryptSecret(token),
            }),
          ],
        );
      });
    }
    return {
      message:
        'If the account exists, password reset instructions have been sent.',
    };
  }

  async resetPassword(token: string, password: string) {
    const hash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 3,
      parallelism: 1,
    });
    await this.databaseService.tx(async (client) => {
      const row = await client.query<{ user_id: string }>(
        "UPDATE email_tokens SET consumed_at=now() WHERE token_hash=$1 AND kind='reset' AND expires_at>now() AND consumed_at IS NULL RETURNING user_id",
        [sha256(token)],
      );
      if (!row.rowCount)
        throw new ForbiddenException('Invalid or expired token');
      const userId = row.rows[0]?.user_id;
      await client.query(
        'INSERT INTO user_credentials(user_id,password_hash) VALUES($1,$2) ON CONFLICT (user_id) DO UPDATE SET password_hash = EXCLUDED.password_hash',
        [userId, hash],
      );
      await client.query(
        'UPDATE user_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL',
        [userId],
      );
    });
    return { reset: true };
  }

  async beginMfa(principal: Principal, password: string) {
    const credential = await this.databaseService.one<{
      password_hash: string;
    }>('SELECT password_hash FROM user_credentials WHERE user_id=$1', [
      principal.user_id,
    ]);
    if (
      !credential ||
      !(await argon2.verify(credential.password_hash, password))
    ) {
      throw new UnauthorizedException('Current password required to setup MFA');
    }
    const secret = randomBytes(20);
    const user = await this.currentUser(principal.user_id);
    await this.databaseService.rows(
      'INSERT INTO mfa_factors(user_id,secret_ciphertext) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET secret_ciphertext=$2,activated_at=NULL,last_step=NULL',
      [principal.user_id, encryptSecret(secret.toString('base64url'))],
    );
    const encoded = base32Encode(secret);
    return {
      secret: encoded,
      otpauth_url: `otpauth://totp/Vigilio:${encodeURIComponent(user.email)}?secret=${encoded}&issuer=Vigilio&digits=6&period=30`,
    };
  }

  async enableMfa(principal: Principal, otp: string) {
    const factor = await this.databaseService.one<{
      secret_ciphertext: string;
    }>(
      'SELECT secret_ciphertext FROM mfa_factors WHERE user_id=$1 AND activated_at IS NULL',
      [principal.user_id],
    );
    if (!factor) throw new ForbiddenException('Invalid authentication code');
    const check = verifyTotpWithStep(
      Buffer.from(decryptSecret(factor.secret_ciphertext), 'base64url'),
      otp,
    );
    if (!check.valid || check.matchedStep === null) {
      throw new ForbiddenException('Invalid authentication code');
    }
    const recoveryCodes = Array.from({ length: 8 }, () => randomToken(15));
    await this.databaseService.tx(async (client) => {
      await client.query(
        'UPDATE mfa_factors SET activated_at=now(), last_step=$2 WHERE user_id=$1',
        [principal.user_id, check.matchedStep],
      );
      await client.query('DELETE FROM mfa_recovery_codes WHERE user_id=$1', [
        principal.user_id,
      ]);
      for (const code of recoveryCodes) {
        await client.query(
          'INSERT INTO mfa_recovery_codes(user_id,code_hash) VALUES($1,$2)',
          [principal.user_id, sha256(code)],
        );
      }
      await client.query(
        'UPDATE user_sessions SET mfa_verified_at=now() WHERE id=$1',
        [principal.session_id],
      );
    });
    await this.auditService.write(
      'mfa.enabled',
      principal.user_id,
      null,
      'user',
      principal.user_id,
    );
    return { enabled: true, recovery_codes: recoveryCodes };
  }

  async stepUpMfa(principal: Principal, body: MfaStepUpDto) {
    const verifiedAt = await this.databaseService.tx(async (client) => {
      const factor = await client.query<{
        secret_ciphertext: string;
        last_step: string | null;
      }>(
        'SELECT secret_ciphertext, last_step FROM mfa_factors WHERE user_id=$1 AND activated_at IS NOT NULL FOR UPDATE',
        [principal.user_id],
      );
      if (!factor.rowCount) {
        throw new ConflictException('MFA is not enabled on this account');
      }
      if (body.recovery_code) {
        const used = await client.query(
          'UPDATE mfa_recovery_codes SET used_at=now() WHERE user_id=$1 AND code_hash=$2 AND used_at IS NULL RETURNING user_id',
          [principal.user_id, sha256(body.recovery_code)],
        );
        if (!used.rowCount)
          throw new UnauthorizedException('Invalid recovery code');
      } else {
        const cipherText = factor.rows[0]?.secret_ciphertext;
        if (!cipherText)
          throw new UnauthorizedException('MFA factor corrupted');
        const secret = Buffer.from(decryptSecret(cipherText), 'base64url');
        const check = verifyTotpWithStep(secret, body.totp!);
        const prevStep =
          factor.rows[0]?.last_step === null
            ? null
            : Number(factor.rows[0]?.last_step);
        if (
          !check.valid ||
          check.matchedStep === null ||
          (prevStep !== null && check.matchedStep <= prevStep)
        ) {
          throw new UnauthorizedException('Invalid or already used TOTP code');
        }
        await client.query(
          'UPDATE mfa_factors SET last_step=$2 WHERE user_id=$1',
          [principal.user_id, check.matchedStep],
        );
      }
      const updated = await client.query<{ mfa_verified_at: Date }>(
        'UPDATE user_sessions SET mfa_verified_at=now() WHERE id=$1 AND user_id=$2 RETURNING mfa_verified_at',
        [principal.session_id, principal.user_id],
      );
      return updated.rows[0]?.mfa_verified_at ?? new Date();
    });
    await this.auditService.write(
      'mfa.step_up_verified',
      principal.user_id,
      null,
      'user',
      principal.user_id,
    );
    return { mfa_verified: true, verified_at: verifiedAt.toISOString() };
  }
}
