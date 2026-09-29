import { env } from '../../config/env.js';
import type { EmailProvider, SendInvoiceEmailInput } from './types.js';
import { resendProvider } from './resend.js';
import { brevoProvider } from './brevo.js';

const providers: Record<string, EmailProvider> = {
  resend: resendProvider,
  brevo: brevoProvider,
};

let activeProvider: EmailProvider | null = null;

export function getEmailProvider(): EmailProvider {
  if (activeProvider) return activeProvider;

  const providerName = env.EMAIL_PROVIDER ?? 'resend';
  const provider = providers[providerName];

  if (!provider) {
    throw new Error(`Unknown Email provider: ${providerName}. Available: ${Object.keys(providers).join(', ')}`);
  }

  activeProvider = provider;
  return activeProvider;
}

export async function sendInvoiceEmail(input: SendInvoiceEmailInput): Promise<void> {
  if (input.pdfBuffer && env.RESEND_API_KEY) {
    return resendProvider.sendInvoiceEmail(input);
  }
  return getEmailProvider().sendInvoiceEmail(input);
}
