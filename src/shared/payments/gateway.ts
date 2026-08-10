// ─── Payment gateway abstraction ─────────────────────────────────────────────
// Adding a new gateway (Flutterwave, Stripe) only requires implementing this
// interface — no changes to the payments module or order code.

export interface InitiatePaymentInput {
  email: string;
  amountKobo: number;
  reference: string;
  callbackUrl: string;
  metadata?: Record<string, unknown>;
}

export interface InitiatePaymentResult {
  authorizationUrl: string;
  reference: string;
}

export interface VerifyPaymentResult {
  status: 'success' | 'failed' | 'abandoned';
  amountKobo: number;
  feeKobo: number;
  currency: string;
  gatewayReference: string;
  paidAt: string | null;
}

export interface PaymentGateway {
  name: string;
  initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentResult>;
  verifyPayment(reference: string): Promise<VerifyPaymentResult>;
  validateWebhookSignature(rawBody: string, signature: string): boolean;
}
