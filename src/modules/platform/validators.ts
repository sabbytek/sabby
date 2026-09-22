import { z } from 'zod';

export const platformLoginBodySchema = z
  .object({
    email: z.email(),
    password: z.string().min(8),
    // Present only when the account has MFA enabled.
    totp: z
      .string()
      .regex(/^\d{6}$/, 'TOTP code must be 6 digits')
      .optional(),
  })
  .strict();

export const platformRefreshBodySchema = z
  .object({
    refreshToken: z.string().min(1),
  })
  .strict();

export const platformLogoutBodySchema = z
  .object({
    refreshToken: z.string().min(1),
  })
  .strict();

export const mfaConfirmBodySchema = z
  .object({
    totp: z.string().regex(/^\d{6}$/, 'TOTP code must be 6 digits'),
  })
  .strict();

export const tenantListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    q: z.string().trim().min(1).max(200).optional(),
    status: z.enum(['trial', 'active', 'grace', 'lapsed', 'cancelled']).optional(),
    plan: z.enum(['trial', 'entry', 'growth', 'enterprise']).optional(),
  })
  .strict();

export const tenantIdParamSchema = z
  .object({
    id: z.string().min(1),
  })
  .strict();

export const changePlanBodySchema = z
  .object({
    planTier: z.enum(['trial', 'entry', 'growth', 'enterprise']),
  })
  .strict();

export const extendTrialBodySchema = z
  .object({
    days: z.coerce.number().int().min(1).max(365),
  })
  .strict();

export type ChangePlanBody = z.infer<typeof changePlanBodySchema>;
export type ExtendTrialBody = z.infer<typeof extendTrialBodySchema>;

export const auditListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    action: z.string().trim().min(1).max(100).optional(),
    targetType: z.string().trim().min(1).max(50).optional(),
    targetId: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

export type AuditListQuery = z.infer<typeof auditListQuerySchema>;

export type TenantListQuery = z.infer<typeof tenantListQuerySchema>;
export type TenantIdParam = z.infer<typeof tenantIdParamSchema>;

export type PlatformLoginBody = z.infer<typeof platformLoginBodySchema>;
export type PlatformRefreshBody = z.infer<typeof platformRefreshBodySchema>;
export type PlatformLogoutBody = z.infer<typeof platformLogoutBodySchema>;
export type MfaConfirmBody = z.infer<typeof mfaConfirmBodySchema>;
