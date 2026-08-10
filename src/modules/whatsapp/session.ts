import { cacheGet, cacheSet, cacheDel } from '../../shared/cache/client.js';

export type WhatsAppState =
  | 'greeting'
  | 'browsing'
  | 'products'
  | 'product_detail'
  | 'cart'
  | 'checkout_name'
  | 'checkout_address'
  | 'awaiting_payment'
  | 'confirmed';

export interface CartItem {
  variantId: string;
  productName: string;
  variantName: string;
  priceKobo: number;
  quantity: number;
}

export interface WhatsAppSession {
  state: WhatsAppState;
  tenantId: string;
  schemaName: string;
  cart: CartItem[];
  selectedCategoryId?: string;
  selectedVariantId?: string;
  customerName?: string;
  customerAddress?: string;
  orderId?: string;
  paymentReference?: string;
}

const SESSION_TTL = 1800; // 30 minutes

function sessionKey(phoneNumberId: string, from: string): string {
  return `wa:session:${phoneNumberId}:${from}`;
}

export async function getSession(phoneNumberId: string, from: string): Promise<WhatsAppSession | null> {
  return cacheGet<WhatsAppSession>(sessionKey(phoneNumberId, from));
}

export async function saveSession(
  phoneNumberId: string,
  from: string,
  session: WhatsAppSession,
): Promise<void> {
  await cacheSet(sessionKey(phoneNumberId, from), session, SESSION_TTL);
}

export async function clearSession(phoneNumberId: string, from: string): Promise<void> {
  await cacheDel(sessionKey(phoneNumberId, from));
}

// Tenant lookup by WhatsApp phone number ID
// Key set by the /whatsapp/setup endpoint or seeded via env at startup
export async function getTenantForPhoneId(
  phoneNumberId: string,
): Promise<{ tenantId: string; schemaName: string } | null> {
  return cacheGet<{ tenantId: string; schemaName: string }>(`wa:tenant:${phoneNumberId}`);
}

export async function registerPhoneIdTenant(
  phoneNumberId: string,
  tenantId: string,
  schemaName: string,
): Promise<void> {
  // No TTL — tenant registration is semi-permanent
  await cacheSet(`wa:tenant:${phoneNumberId}`, { tenantId, schemaName }, 60 * 60 * 24 * 365);
}
