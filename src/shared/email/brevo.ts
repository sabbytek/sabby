import { env } from '../../config/env.js';

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

export interface SendInvoiceEmailInput {
  to: string;
  businessName: string;
  invoiceNumber: string;
  totalNaira: string;
  pdfBuffer: Buffer;
}

export async function sendInvoiceEmail(input: SendInvoiceEmailInput): Promise<void> {
  const apiKey = env.BREVO_API_KEY;
  if (!apiKey) return; // silently skip when not configured

  const from = env.EMAIL_FROM ?? `invoices@${new URL(env.PLATFORM_BASE_URL).hostname}`;

  const response = await fetch(BREVO_API_URL, {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'api-key': apiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      sender: { email: from },
      to: [{ email: input.to }],
      subject: `Invoice ${input.invoiceNumber} from ${input.businessName}`,
      htmlContent: [
        `<p>Hi there,</p>`,
        `<p>Please find attached your invoice <strong>${input.invoiceNumber}</strong>`,
        ` for <strong>${input.totalNaira}</strong> from ${input.businessName}.</p>`,
        `<p>Thank you for your business!</p>`,
      ].join(''),
      attachment: [
        {
          name: `${input.invoiceNumber}.pdf`,
          content: input.pdfBuffer.toString('base64'),
        },
      ],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Brevo API error: ${response.status} ${error}`);
  }
}
