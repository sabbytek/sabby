import { z } from 'zod';

export const loginBodySchema = z.object({
  tenantSlug: z.string(),
  email: z.string().email(),
  password: z.string().min(8),
}).strict();

export const refreshBodySchema = z.object({
  tenantSlug: z.string(),
  refreshToken: z.string(),
}).strict();

export const logoutBodySchema = z.object({
  refreshToken: z.string(),
}).strict();

export const forgotPasswordBodySchema = z.object({
  tenantSlug: z.string(),
  email: z.string().email(),
}).strict();

export const resetPasswordBodySchema = z.object({
  tenantSlug: z.string(),
  token: z.string().min(1),
  newPassword: z.string().min(8),
}).strict();

export type LoginBody = z.infer<typeof loginBodySchema>;
export type RefreshBody = z.infer<typeof refreshBodySchema>;
export type LogoutBody = z.infer<typeof logoutBodySchema>;
export type ForgotPasswordBody = z.infer<typeof forgotPasswordBodySchema>;
export type ResetPasswordBody = z.infer<typeof resetPasswordBodySchema>;
