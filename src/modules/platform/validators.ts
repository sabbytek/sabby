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

export type PlatformLoginBody = z.infer<typeof platformLoginBodySchema>;
export type PlatformRefreshBody = z.infer<typeof platformRefreshBodySchema>;
export type PlatformLogoutBody = z.infer<typeof platformLogoutBodySchema>;
export type MfaConfirmBody = z.infer<typeof mfaConfirmBodySchema>;
