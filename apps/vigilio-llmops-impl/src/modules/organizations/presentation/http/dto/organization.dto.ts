import { z } from 'zod';

export const createOrgSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    slug: z.string().regex(/^[a-z0-9][a-z0-9-]{2,49}$/),
  })
  .strict();
export type CreateOrgRequestDto = z.infer<typeof createOrgSchema>;

export const createWorkspaceSchema = createOrgSchema;
export type CreateWorkspaceRequestDto = z.infer<typeof createWorkspaceSchema>;

export const orgPatchSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
  })
  .strict();
export type OrgPatchDto = z.infer<typeof orgPatchSchema>;

export const workspacePatchSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
  })
  .strict();
export type WorkspacePatchDto = z.infer<typeof workspacePatchSchema>;

export const addMemberSchema = z
  .object({
    email: z.email().transform((value) => value.trim().toLowerCase()),
    role: z.enum(['admin', 'developer', 'approver', 'analyst', 'viewer']),
  })
  .strict();
export type AddMemberDto = z.infer<typeof addMemberSchema>;

export const memberRoleSchema = z
  .object({
    role: z.enum(['admin', 'developer', 'approver', 'analyst', 'viewer']),
  })
  .strict();
export type MemberRoleDto = z.infer<typeof memberRoleSchema>;

export const invitationSchema = z
  .object({
    email: z
      .email()
      .max(254)
      .transform((x) => x.trim().toLowerCase()),
    role: z.enum(['admin', 'developer', 'approver', 'analyst', 'viewer']),
  })
  .strict();
export type InvitationDto = z.infer<typeof invitationSchema>;

export const acceptSchema = z
  .object({
    token: z.string().min(24).max(256),
  })
  .strict();
export type AcceptInvitationDto = z.infer<typeof acceptSchema>;
