import crypto from 'crypto';
import { env } from '../../config/env.js';
import type {
  PaymentGateway,
  InitiatePaymentInput,
  InitiatePaymentResult,
  VerifyPaymentResult,
} from './gateway.js';

const FW_BASE = 'https://api.flutterwave.com/v3';

async function fwRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const secretKey = env.FLUTTERWAVE_SECRET_KEY;
  if (!secretKey) throw new Error('Flutterwave is not configured');

  const response = await fetch(`${FW_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  const json = (await response.json()) as { status: string; message: string; data: T };
  if (json.status !== 'success') {
    throw new Error(`Flutterwave error: ${json.message}`);
  }
  return json.data;
}

interface FwInitData {
  link: string;
}

interface FwVerifyData {
  status: string;
  amount: number; // NGN
  app_fee: number; // NGN
  currency: string;
  flw_ref: string;
  created_at: string;
}

export const flutterwaveGateway: PaymentGateway = {
  name: 'flutterwave',

  async initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
    const data = await fwRequest<FwInitData>('/payments', {
      method: 'POST',
      body: JSON.stringify({
        tx_ref: input.reference,
        amount: input.amountKobo / 100, // Flutterwave expects NGN (naira)
        currency: 'NGN',
        redirect_url: input.callbackUrl,
        customer: { email: input.email },
        meta: input.metadata ?? {},
      }),
    });
    return { authorizationUrl: data.link, reference: input.reference };
  },

  async verifyPayment(reference: string): Promise<VerifyPaymentResult> {
    // Flutterwave verify by tx_ref uses the search endpoint
    const data = await fwRequest<FwVerifyData[]>(
      `/transactions?tx_ref=${encodeURIComponent(reference)}`,
    );
    const tx = data[0];
    if (!tx) throw new Error(`Transaction not found: ${reference}`);

    const status =
      tx.status === 'successful' ? 'success' : tx.status === 'abandoned' ? 'abandoned' : 'failed';

    return {
      status,
      amountKobo: Math.round(tx.amount * 100),
      feeKobo: Math.round((tx.app_fee ?? 0) * 100),
      currency: tx.currency,
      gatewayReference: tx.flw_ref,
      paidAt: tx.created_at ?? null,
    };
  },

  validateWebhookSignature(_rawBody: string, signature: string): boolean {
    const secret = env.FLUTTERWAVE_WEBHOOK_SECRET;
    if (!secret) return false;
    try {
      return crypto.timingSafeEqual(Buffer.from(secret, 'utf-8'), Buffer.from(signature, 'utf-8'));
    } catch {
      return false;
    }
  },
};
