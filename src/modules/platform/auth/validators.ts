import { z } from 'zod';

export const platformLoginBodySchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(8),
    /** Required for roles in MFA_REQUIRED_ROLES; enforced in the service. */
    totpCode: z
      .string()
      .regex(/^\d{6}$/, 'MFA code must be 6 digits')
      .optional(),
  })
  .strict();

export const platformRefreshBodySchema = z.object({ refreshToken: z.string().min(1) }).strict();

export const platformLogoutBodySchema = z.object({ refreshToken: z.string().min(1) }).strict();

export const mfaVerifyBodySchema = z
  .object({ code: z.string().regex(/^\d{6}$/, 'MFA code must be 6 digits') })
  .strict();

export type PlatformLoginBody = z.infer<typeof platformLoginBodySchema>;
export type PlatformRefreshBody = z.infer<typeof platformRefreshBodySchema>;
export type PlatformLogoutBody = z.infer<typeof platformLogoutBodySchema>;
export type MfaVerifyBody = z.infer<typeof mfaVerifyBodySchema>;
