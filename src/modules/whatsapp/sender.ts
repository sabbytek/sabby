import { env } from '../../config/env.js';

const GRAPH_BASE = 'https://graph.facebook.com/v18.0';

type WaMessagePayload = Record<string, unknown>;

async function sendMessage(phoneNumberId: string, payload: WaMessagePayload): Promise<void> {
  if (!env.WHATSAPP_ACCESS_TOKEN) {
    // Stub: log in dev, skip silently in prod
    console.log('[WhatsApp stub]', JSON.stringify({ phoneNumberId, payload }));
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
