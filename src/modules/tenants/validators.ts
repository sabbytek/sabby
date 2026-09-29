import { z } from 'zod';
import { successEnvelope } from '../../shared/http/schemas.js';

export const createTenantBodySchema = z
  .object({
    name: z.string().min(2).max(100),
    slug: z
      .string()
      .min(2)
      .max(50)
      .regex(/^[a-z0-9-]+$/)
      .describe('Business handle: lowercase letters, numbers, hyphens. Users log in with it as `tenantSlug`'),
    businessEmail: z.string().email(),
    businessPhone: z.string().optional(),
    ownerFirstName: z.string().min(1),
    ownerLastName: z.string().min(1),
    ownerPassword: z.string().min(8),
  })
  .strict();

export const createTenantResponseSchema = successEnvelope(
  z.object({
    tenantId: z.string().uuid(),
    slug: z.string().describe('Use as `tenantSlug` when logging in'),
    message: z.string(),
  }),
);

export type CreateTenantBody = z.infer<typeof createTenantBodySchema>;
