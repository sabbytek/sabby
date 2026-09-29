/**
 * Termii SMS provider.
 * Docs: https://developer.termii.com/
 */

import { env } from '../../config/env.js';
import { ExternalServiceError } from '../errors/types.js';
import type { SmsProvider } from './types.js';

interface TermiiPayload {
  to: string;
  from: string;
  sms: string;
  type: 'plain' | 'unicode';
  channel: 'dnd' | 'generic' | 'whatsapp';
}

interface TermiiResponse {
  code: string;
  message: string;
  requestId?: string;
}

export const termiiProvider: SmsProvider = {
  name: 'termii',

  async send(to, message) {
    if (!env.TERMII_API_KEY) {
      console.warn('TERMII_API_KEY not configured, skipping SMS');
      return;
    }

    const payload: TermiiPayload = {
      to,
      from: env.TERMII_SENDER_ID,
      sms: message,
      type: 'plain',
      channel: 'dnd',
    };

    const response = await fetch('https://api.termii.com/api/sms/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.TERMII_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    const result = (await response.json()) as TermiiResponse;

    if (!response.ok || result.code !== '200') {
      throw new ExternalServiceError('Termii', `SMS failed: ${result.message ?? response.status}`);
    }
  },
};
