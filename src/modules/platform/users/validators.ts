import { z } from 'zod';

const platformRoleSchema = z.enum(['super_admin', 'admin', 'support', 'read_only']);

/**
 * A reason is mandatory on every state change — it is what makes the platform
 * audit log explain what happened rather than merely record it. Mirrors the
 * tenants module.
 */
const reasonSchema = z
  .string()
  .min(10, 'Give a reason of at least 10 characters — it is recorded in the audit log')
  .max(500);

export const listPlatformUsersQuerySchema = z
  .object({
    search: z.string().min(1).optional(),
    role: platformRoleSchema.optional(),
    isActive: z.coerce.boolean().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export const platformUserIdParamsSchema = z.object({ id: z.string().min(1) }).strict();

export const createPlatformUserBodySchema = z
  .object({
    email: z.string().email(),
    firstName: z.string().min(1).max(100),
    lastName: z.string().min(1).max(100),
    role: platformRoleSchema,
    // A high-privilege console: hold the initial secret to a real length.
    temporaryPassword: z.string().min(12).max(200),
    reason: reasonSchema,
  })
  .strict();

export const updatePlatformUserBodySchema = z
  .object({
    firstName: z.string().min(1).max(100).optional(),
    lastName: z.string().min(1).max(100).optional(),
    role: platformRoleSchema.optional(),
    isActive: z.boolean().optional(),
    reason: reasonSchema,
  })
  .strict()
  .refine(
    (b) =>
      b.firstName !== undefined ||
      b.lastName !== undefined ||
      b.role !== undefined ||
      b.isActive !== undefined,
    { message: 'Provide at least one field to update' },
  );

export const resetPlatformUserPasswordBodySchema = z.object({ reason: reasonSchema }).strict();

export type ListPlatformUsersQuery = z.infer<typeof listPlatformUsersQuerySchema>;
export type PlatformUserIdParams = z.infer<typeof platformUserIdParamsSchema>;
export type CreatePlatformUserBody = z.infer<typeof createPlatformUserBodySchema>;
export type UpdatePlatformUserBody = z.infer<typeof updatePlatformUserBodySchema>;
