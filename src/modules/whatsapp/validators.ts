import { z } from 'zod';

export const webhookVerifyQuerySchema = z.object({
  'hub.mode': z.string(),
  'hub.verify_token': z.string(),
  'hub.challenge': z.string(),
});

export const setupBodySchema = z.object({
  phoneNumberId: z.string(),
}).strict();

export type WebhookVerifyQuery = z.infer<typeof webhookVerifyQuerySchema>;
export type SetupBody = z.infer<typeof setupBodySchema>;
