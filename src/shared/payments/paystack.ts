import crypto from 'crypto';
import { env } from '../../config/env.js';
import type { PaymentGateway, InitiatePaymentInput, InitiatePaymentResult, VerifyPaymentResult } from './gateway.js';

const PAYSTACK_BASE = 'https://api.paystack.co';

async function paystackRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${PAYSTACK_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  const json = (await response.json()) as { status: boolean; message: string; data: T };
  if (!json.status) {
    throw new Error(`Paystack error: ${json.message}`);
  }
  return json.data;
}

interface PaystackInitData {
  authorization_url: string;
  reference: string;
}

interface PaystackVerifyData {
  status: string;
  amount: number; // kobo
  fees: number;   // kobo
  currency: string;
  reference: string;
  paid_at: string | null;
}

export const paystackGateway: PaymentGateway = {
  name: 'paystack',

  async initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
    const data = await paystackRequest<PaystackInitData>('/transaction/initialize', {
      method: 'POST',
      body: JSON.stringify({
        email: input.email,
        amount: input.amountKobo,
        reference: input.reference,
        callback_url: input.callbackUrl,
        metadata: input.metadata ?? {},
      }),
    });
    return { authorizationUrl: data.authorization_url, reference: data.reference };
  },

  async verifyPayment(reference: string): Promise<VerifyPaymentResult> {
    const data = await paystackRequest<PaystackVerifyData>(`/transaction/verify/${reference}`);
    const status =
      data.status === 'success' ? 'success'
      : data.status === 'abandoned' ? 'abandoned'
      : 'failed';
    return {
      status,
      amountKobo: data.amount,
      feeKobo: data.fees ?? 0,
      currency: data.currency,
      gatewayReference: data.reference,
      paidAt: data.paid_at,
    };
  },

  validateWebhookSignature(rawBody: string, signature: string): boolean {
    const expected = crypto
      .createHmac('sha512', env.PAYSTACK_SECRET_KEY)
      .update(rawBody)
      .digest('hex');
    try {
      return crypto.timingSafeEqual(Buffer.from(expected, 'utf-8'), Buffer.from(signature, 'utf-8'));
    } catch {
      return false;
    }
  },
};
