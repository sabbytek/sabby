/**
 * SMS provider registry — resolves the active provider from env config.
 */

import { env } from '../../config/env.js';
import type { SmsProvider } from './types.js';
import { termiiProvider } from './termii.js';
import { vtpassProvider } from './vtpass.js';

const providers: Record<string, SmsProvider> = {
  termii: termiiProvider,
  vtpass: vtpassProvider,
};

let activeProvider: SmsProvider | null = null;

/**
 * Get the active SMS provider (singleton).
 * Falls back to Termii if SMS_PROVIDER is unset.
 */
export function getSmsProvider(): SmsProvider {
  if (activeProvider) return activeProvider;

  const providerName = env.SMS_PROVIDER ?? 'termii';
  const provider = providers[providerName];

  if (!provider) {
    throw new Error(`Unknown SMS provider: ${providerName}. Available: ${Object.keys(providers).join(', ')}`);
  }

  activeProvider = provider;
  return activeProvider;
}

/**
 * Send SMS via the configured provider.
 */
export async function sendSMS(to: string, message: string): Promise<void> {
  return getSmsProvider().send(to, message);
}
