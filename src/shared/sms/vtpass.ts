/**
 * VTPASS SMS provider.
 * Docs: https://vtpass.com/documentation
 */

import { env } from '../../config/env.js';
import { ExternalServiceError } from '../errors/types.js';
import type { SmsProvider } from './types.js';

interface VtpassResponse {
  code: string;
  message: string;
  requestId?: string;
}

export const vtpassProvider: SmsProvider = {
  name: 'vtpass',

  async send(to, message) {
    if (!env.VTPASS_API_KEY) {
      console.warn('VTPASS_API_KEY not configured, skipping SMS');
      return;
    }

    const response = await fetch('https://www.vtpass.com/api/sms/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.VTPASS_API_KEY}`,
      },
      body: JSON.stringify({
        to,
        from: env.VTPASS_SENDER_ID ?? 'BPOS',
        message,
      }),
    });

    const result = (await response.json()) as VtpassResponse;

    if (!response.ok || result.code !== '200') {
      throw new ExternalServiceError('VTPASS', `SMS failed: ${result.message ?? response.status}`);
    }
  },
};
