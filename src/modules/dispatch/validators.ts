import { z } from 'zod';

export const configureDispatchBodySchema = z.object({
  provider: z.enum(['traka', 'sendstack', 'gig', 'dhl', 'kwik', 'generic']),
  apiKey: z.string().min(10),
  webhookSecret: z.string().min(8),
  baseUrl: z.string().optional(),
}).strict();

export const quoteBodySchema = z.object({
  pickupAddress: z.string(),
  deliveryAddress: z.string(),
  weightKg: z.number().min(0.1),
}).strict();

export const dispatchOrderParamsSchema = z.object({
  orderId: z.string(),
});

export const dispatchOrderBodySchema = z.object({
  pickupAddress: z.string(),
  recipientName: z.string(),
  recipientPhone: z.string(),
  weightKg: z.number().min(0.1),
}).strict();

export const trackParamsSchema = z.object({
  orderId: z.string(),
});

export type ConfigureDispatchBody = z.infer<typeof configureDispatchBodySchema>;
export type QuoteBody = z.infer<typeof quoteBodySchema>;
export type DispatchOrderParams = z.infer<typeof dispatchOrderParamsSchema>;
export type DispatchOrderBody = z.infer<typeof dispatchOrderBodySchema>;
export const webhookParamsSchema = z.object({
  provider: z.string(),
  tenantId: z.string(),
});

export type TrackParams = z.infer<typeof trackParamsSchema>;
export type WebhookParams = z.infer<typeof webhookParamsSchema>;
