import { paystackGateway } from './paystack.js';
import { flutterwaveGateway } from './flutterwave.js';
import type { PaymentGateway } from './gateway.js';
import { env } from '../../config/env.js';

export type GatewayName = 'paystack' | 'flutterwave';

export function getGateway(name?: GatewayName): PaymentGateway {
  const selected = name ?? (env.DEFAULT_PAYMENT_GATEWAY as GatewayName | undefined) ?? 'paystack';
  if (selected === 'flutterwave') return flutterwaveGateway;
  return paystackGateway;
}

export { paystackGateway, flutterwaveGateway };
export type { PaymentGateway };
