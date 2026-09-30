import { z } from 'zod';

export const initiatePaymentBodySchema = z
  .object({
    orderId: z.string(),
    email: z.string().email(),
  })
  .strict();

export type InitiatePaymentBody = z.infer<typeof initiatePaymentBodySchema>;
