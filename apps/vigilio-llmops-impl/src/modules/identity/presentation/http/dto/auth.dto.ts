import { z } from 'zod';

export const registerRequestSchema = z
  .object({
    email: z
      .email()
      .max(254)
      .transform((value) => value.trim().toLowerCase()),
    password: z.string().min(12).max(128),
    display_name: z.string().trim().min(2).max(100),
    consent_version: z.string().min(1).max(32),
  })
  .strict();
export type RegisterRequestDto = z.infer<typeof registerRequestSchema>;

export const loginRequestSchema = z
  .object({
    email: z
      .email()
      .max(254)
      .transform((value) => value.trim().toLowerCase()),
    password: z.string().min(1).max(128),
    totp: z
      .string()
      .regex(/^\d{6}$/)
      .optional(),
    recovery_code: z
      .string()
      .regex(/^[a-zA-Z0-9_-]{16,50}$/)
      .optional(),
  })
  .strict();
export type LoginRequestDto = z.infer<typeof loginRequestSchema>;

export const tokenRequestSchema = z
  .object({
    token: z.string().min(24).max(256),
  })
  .strict();
export type TokenRequestDto = z.infer<typeof tokenRequestSchema>;

export const forgotRequestSchema = z
  .object({
    email: z.email().transform((value) => value.trim().toLowerCase()),
  })
  .strict();
export type ForgotRequestDto = z.infer<typeof forgotRequestSchema>;

export const resetRequestSchema = tokenRequestSchema
  .extend({
    password: z.string().min(12).max(128),
  })
  .strict();
export type ResetRequestDto = z.infer<typeof resetRequestSchema>;

export const mfaSetupSchema = z
  .object({
    password: z.string().min(1).max(128),
  })
  .strict();
export type MfaSetupDto = z.infer<typeof mfaSetupSchema>;

export const mfaVerifySchema = z
  .object({
    otp: z.string().regex(/^\d{6}$/),
  })
  .strict();
export type MfaVerifyDto = z.infer<typeof mfaVerifySchema>;

export const mfaStepUpSchema = z
  .object({
    totp: z
      .string()
      .regex(/^\d{6}$/)
      .optional(),
    recovery_code: z
      .string()
      .regex(/^[a-zA-Z0-9_-]{16,50}$/)
      .optional(),
  })
  .strict()
  .refine((val) => Boolean(val.totp) !== Boolean(val.recovery_code), {
    message: 'Provide either totp or recovery_code',
  });
export type MfaStepUpDto = z.infer<typeof mfaStepUpSchema>;

export const mfaCompleteSchema = z
  .object({
    challenge_token: z.string().min(24).max(256),
    totp: z
      .string()
      .regex(/^\d{6}$/)
      .optional(),
    recovery_code: z
      .string()
      .regex(/^[a-zA-Z0-9_-]{16,50}$/)
      .optional(),
  })
  .strict()
  .refine((val) => Boolean(val.totp) !== Boolean(val.recovery_code), {
    message: 'Provide either totp or recovery_code',
  });
export type MfaCompleteDto = z.infer<typeof mfaCompleteSchema>;

export const rotateRecoverySchema = z
  .object({
    password: z.string().min(1).max(128),
  })
  .strict();

export const disableMfaSchema = z
  .object({
    password: z.string().min(1).max(128),
    totp: z.string().regex(/^\d{6}$/),
  })
  .strict();

export const passwordChangeSchema = z
  .object({
    current_password: z.string().min(1).max(128),
    new_password: z.string().min(12).max(128),
  })
  .strict();

export const emailChangeSchema = z
  .object({
    next_email: z
      .email()
      .max(254)
      .transform((x) => x.trim().toLowerCase()),
    password: z.string().min(1).max(128),
  })
  .strict();

export const emailConfirmSchema = z
  .object({
    token: z.string().min(24).max(256),
  })
  .strict();

export const profilePatchSchema = z
  .object({
    display_name: z.string().trim().min(2).max(100),
  })
  .strict();

export const facebookSignedRequestSchema = z
  .object({
    signed_request: z.string().min(20).max(16000),
  })
  .strict();

export const meResponseSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  display_name: z.string(),
  email_verified: z.boolean(),
  mfa_enabled: z.boolean(),
  has_password: z.boolean(),
});
export type MeResponseDto = z.infer<typeof meResponseSchema>;
