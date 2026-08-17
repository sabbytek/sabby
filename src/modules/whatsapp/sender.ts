import { env } from '../../config/env.js';

const GRAPH_BASE = 'https://graph.facebook.com/v18.0';

type WaMessagePayload = Record<string, unknown>;

async function sendMessage(phoneNumberId: string, payload: WaMessagePayload): Promise<void> {
  if (!env.WHATSAPP_ACCESS_TOKEN) {
    // WhatsApp not configured - skip silently
    return;
  }
  await fetch(`${GRAPH_BASE}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
  });
}

export async function sendText(phoneNumberId: string, to: string, body: string): Promise<void> {
  await sendMessage(phoneNumberId, { to, type: 'text', text: { body } });
}

export interface ListRow {
  id: string;
  title: string;
  description?: string;
}

export async function sendList(
  phoneNumberId: string,
  to: string,
  bodyText: string,
  buttonLabel: string,
  sections: { title: string; rows: ListRow[] }[],
): Promise<void> {
  await sendMessage(phoneNumberId, {
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: bodyText },
      action: { button: buttonLabel, sections },
    },
  });
}

export interface ButtonOption {
  id: string;
  title: string;
}

export async function sendButtons(
  phoneNumberId: string,
  to: string,
  bodyText: string,
  buttons: ButtonOption[],
): Promise<void> {
  await sendMessage(phoneNumberId, {
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: bodyText },
      action: {
        buttons: buttons.map((b) => ({ type: 'reply', reply: { id: b.id, title: b.title } })),
      },
    },
  });
}

export function formatNaira(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
}

/**
 * Sends a receipt notification via WhatsApp text with a PDF download link.
 * Uses a plain text message since WhatsApp Cloud API document sending
 * requires a hosted media URL — the R2 pdfUrl serves that purpose.
 */
export async function sendReceiptWhatsApp(
  phoneNumberId: string,
  to: string,
  businessName: string,
  orderNumber: string,
  totalKobo: number,
  pdfUrl: string,
): Promise<void> {
  const body = [
    `✅ *Receipt from ${businessName}*`,
    `Order: *${orderNumber}*`,
    `Total: *${formatNaira(totalKobo)}*`,
    ``,
    `Download your receipt: ${pdfUrl}`,
    ``,
    `Thank you for your purchase! 🙏`,
  ].join('\n');

  await sendText(phoneNumberId, to, body);
}
