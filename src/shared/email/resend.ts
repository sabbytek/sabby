import { Resend } from 'resend';
import { env } from '../../config/env.js';

let _client: Resend | null = null;

function getResend(): Resend {
  _client ??= new Resend(env.RESEND_API_KEY);
  return _client;
}

export interface SendReceiptEmailInput {
  to: string;
  businessName: string;
  orderNumber: string;
  totalNaira: string;
  pdfUrl: string;
}

export async function sendReceiptEmail(input: SendReceiptEmailInput): Promise<void> {
  if (!env.RESEND_API_KEY) return;

  const from = env.EMAIL_FROM ?? `receipts@${new URL(env.PLATFORM_BASE_URL).hostname}`;

  await getResend().emails.send({
    from,
    to: input.to,
    subject: `Your receipt from ${input.businessName} — ${input.orderNumber}`,
    html: [
      `<p>Hi there,</p>`,
      `<p>Thank you for your purchase! Here is your receipt for order <strong>${input.orderNumber}</strong>`,
      ` totalling <strong>${input.totalNaira}</strong>.</p>`,
      `<p><a href="${input.pdfUrl}">Download your receipt (PDF)</a></p>`,
      `<p>Thank you for shopping with ${input.businessName}.</p>`,
    ].join(''),
  });
}

export interface SendInvoiceEmailInput {
  to: string;
  businessName: string;
  invoiceNumber: string;
  totalNaira: string;
  pdfBuffer: Buffer;
}

export async function sendInvoiceEmail(input: SendInvoiceEmailInput): Promise<void> {
  if (!env.RESEND_API_KEY) return; // silently skip when not configured

  const from = env.EMAIL_FROM ?? `invoices@${new URL(env.PLATFORM_BASE_URL).hostname}`;

  await getResend().emails.send({
    from,
    to: input.to,
    subject: `Invoice ${input.invoiceNumber} from ${input.businessName}`,
    html: [
      `<p>Hi there,</p>`,
      `<p>Please find attached your invoice <strong>${input.invoiceNumber}</strong>`,
      ` for <strong>${input.totalNaira}</strong> from ${input.businessName}.</p>`,
      `<p>Thank you for your business!</p>`,
    ].join(''),
    attachments: [
      {
        filename: `${input.invoiceNumber}.pdf`,
        content: input.pdfBuffer,
      },
    ],
  });
}
