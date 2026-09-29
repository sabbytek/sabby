import { z } from 'zod';

/** Same bar as the tenant-admin actions: an unexplained grant is not defensible. */
const reasonSchema = z
  .string()
  .min(10, 'Give a reason of at least 10 characters — the merchant sees it in their audit log')
  .max(500);

export const openGrantBodySchema = z
  .object({
    tenantId: z.string().min(1),
    scope: z.enum(['read', 'write']).default('read'),
    reason: reasonSchema,
    // Capped at 24h server-side regardless of what is sent.
    durationMinutes: z.coerce.number().int().min(5).max(1440).optional(),
  })
  .strict();

export const listGrantsQuerySchema = z
  .object({
    tenantId: z.string().min(1).optional(),
    activeOnly: z.coerce.boolean().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export const grantIdParamsSchema = z.object({ id: z.string().min(1) }).strict();

export const tenantIdParamsSchema = z.object({ tenantId: z.string().min(1) }).strict();

export const paginationQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export const resendReceiptBodySchema = z.object({ invoiceId: z.string().min(1) }).strict();

export const retryWebhookBodySchema = z.object({ rawPayload: z.string().min(2) }).strict();

export const unlockAccountBodySchema = z
  .object({ userId: z.string().min(1), reason: reasonSchema })
  .strict();

export const resetPasswordBodySchema = z
  .object({ email: z.string().email(), reason: reasonSchema })
  .strict();

export type OpenGrantBody = z.infer<typeof openGrantBodySchema>;
export type ListGrantsQuery = z.infer<typeof listGrantsQuerySchema>;
export type UnlockAccountBody = z.infer<typeof unlockAccountBodySchema>;
