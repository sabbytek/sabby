import { z } from 'zod';
import { errorEnvelopeSchema, successEnvelope } from '../../shared/http/schemas.js';

const tenantSlug = z
  .string()
  .describe("The business handle chosen at signup (tenant `slug`), e.g. `fashion-hub`");

export const loginBodySchema = z
  .object({
    tenantSlug,
    email: z.string().email(),
    password: z.string().min(8),
  })
  .strict();

export const refreshBodySchema = z
  .object({
    tenantSlug,
    refreshToken: z.string().describe('Refresh token returned by /v1/auth/login'),
  })
  .strict();

export const logoutBodySchema = z
  .object({
    refreshToken: z.string(),
  })
  .strict();

export const forgotPasswordBodySchema = z
  .object({
    tenantSlug,
    email: z.string().email(),
  })
  .strict();

export const resetPasswordBodySchema = z
  .object({
    tenantSlug,
    token: z.string().min(1),
    newPassword: z.string().min(8),
  })
  .strict();

// ─── Responses ───────────────────────────────────────────────────────────────

const roleSchema = z.enum(['owner', 'manager', 'staff', 'viewer']);

export const authUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  role: roleSchema,
});

export const loginResponseSchema = successEnvelope(
  z.object({
    accessToken: z.string().describe('JWT for `Authorization: Bearer`. Short-lived (JWT_ACCESS_EXPIRY, 15m by default)'),
    refreshToken: z
      .string()
      .describe('Opaque token for /v1/auth/refresh and /v1/auth/logout. Valid 7 days; not rotated on refresh'),
    user: authUserSchema,
  }),
);

export const refreshResponseSchema = successEnvelope(
  z.object({
    accessToken: z.string().describe('New access token. The refresh token stays the same'),
  }),
);

export const meResponseSchema = successEnvelope(
  z.object({
    userId: z.string(),
    tenantId: z.string(),
    email: z.string(),
    role: roleSchema,
  }),
);

export const messageResponseSchema = successEnvelope(z.object({ message: z.string() }));

export { errorEnvelopeSchema };

export type LoginBody = z.infer<typeof loginBodySchema>;
export type RefreshBody = z.infer<typeof refreshBodySchema>;
export type LogoutBody = z.infer<typeof logoutBodySchema>;
export type ForgotPasswordBody = z.infer<typeof forgotPasswordBodySchema>;
export type ResetPasswordBody = z.infer<typeof resetPasswordBodySchema>;
