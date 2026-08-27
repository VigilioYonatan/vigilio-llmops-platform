export const IDENTITY_REPOSITORY_PORT = Symbol('IDENTITY_REPOSITORY_PORT');

export interface SessionCookiesPayload {
  session: string;
  csrf: string;
}

export interface UserProfileView {
  id: string;
  email: string;
  display_name: string;
  email_verified: boolean;
  mfa_enabled: boolean;
  has_password: boolean;
}

export interface IdentityRepositoryPort {
  hasActiveMfa(userId: string): Promise<boolean>;
}
