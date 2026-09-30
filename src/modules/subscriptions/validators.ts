import { z } from 'zod';

export const initiateSubscriptionBodySchema = z
  .object({
    planTier: z.enum(['entry', 'growth', 'enterprise']),
  })
  .strict();

export type InitiateSubscriptionBody = z.infer<typeof initiateSubscriptionBodySchema>;
