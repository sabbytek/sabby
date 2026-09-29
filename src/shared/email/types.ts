export interface SendInvoiceEmailInput {
  to: string;
  businessName: string;
  invoiceNumber: string;
  totalNaira: string;
  pdfBuffer?: Buffer;
}

export interface EmailProvider {
  readonly name: string;
  sendInvoiceEmail(input: SendInvoiceEmailInput): Promise<void>;
}
