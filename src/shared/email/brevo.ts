import { env } from '../../config/env.js';
import type { EmailProvider, SendInvoiceEmailInput } from './types.js';

export const brevoProvider: EmailProvider = {
  name: 'brevo',
  async sendInvoiceEmail(input: SendInvoiceEmailInput): Promise<void> {
    if (!env.BREVO_API_KEY) return; // silently skip when not configured

    const from = env.EMAIL_FROM ?? `invoices@${new URL(env.PLATFORM_BASE_URL).hostname}`;

    const payload = {
      sender: { email: from },
      to: [{ email: input.to }],
      subject: `Invoice ${input.invoiceNumber} from ${input.businessName}`,
      htmlContent: [
        `<p>Hi there,</p>`,
        `<p>Please find attached your invoice <strong>${input.invoiceNumber}</strong>`,
        ` for <strong>${input.totalNaira}</strong> from ${input.businessName}.</p>`,
        `<p>Thank you for your business!</p>`,
      ].join(''),
      ...(input.pdfBuffer
        ? {
            attachment: [
              {
                name: `${input.invoiceNumber}.pdf`,
                content: input.pdfBuffer.toString('base64'),
              },
            ],
          }
        : {}),
    };

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': env.BREVO_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Brevo API Error] ${response.status} ${response.statusText}`, errorText);
    }
  },
};
