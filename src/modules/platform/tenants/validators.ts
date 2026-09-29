import { z } from 'zod';

const planTierSchema = z.enum(['trial', 'entry', 'growth', 'enterprise']);

/**
 * A reason is mandatory on every state change. It is the difference between
 * an audit log that explains what happened and one that merely records it.
 */
const reasonSchema = z
  .string()
  .min(10, 'Give a reason of at least 10 characters — it is recorded in the audit log')
  .max(500);

export const listTenantsQuerySchema = z
  .object({
    search: z.string().min(1).optional(),
    planTier: planTierSchema.optional(),
    isActive: z.coerce.boolean().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export const tenantIdParamsSchema = z.object({ id: z.string().min(1) }).strict();

/** Admin-initiated provisioning — the public signup body plus a required reason. */
export const createTenantBodySchema = z
  .object({
    name: z.string().min(2).max(100),
    slug: z
      .string()
      .min(2)
      .max(50)
      .regex(/^[a-z0-9-]+$/),
    businessEmail: z.string().email(),
    businessPhone: z.string().optional(),
    ownerFirstName: z.string().min(1),
    ownerLastName: z.string().min(1),
    ownerPassword: z.string().min(8),
    reason: reasonSchema,
  })
  .strict();

export const suspendTenantBodySchema = z.object({ reason: reasonSchema }).strict();

export const changePlanBodySchema = z
  .object({
    planTier: planTierSchema,
    reason: reasonSchema,
  })
  .strict();

export type ListTenantsQuery = z.infer<typeof listTenantsQuerySchema>;
export type TenantIdParams = z.infer<typeof tenantIdParamsSchema>;
export type SuspendTenantBody = z.infer<typeof suspendTenantBodySchema>;
export type ChangePlanBody = z.infer<typeof changePlanBodySchema>;
