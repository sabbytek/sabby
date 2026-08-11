import { sendInvoiceEmail } from '../src/shared/email/brevo.js';

async function testBrevoEmail() {
  console.log('Testing Brevo email service...\n');

  // Create a simple test PDF buffer (minimal valid PDF)
  const testPdfContent = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >> endobj
xref
0 4
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
trailer << /Size 4 /Root 1 0 R >>
startxref
193
%%EOF`;

  const pdfBuffer = Buffer.from(testPdfContent);

  try {
    await sendInvoiceEmail({
      to: process.argv[2] || 'test@example.com',
      businessName: 'Test Business',
      invoiceNumber: 'INV-TEST-001',
      totalNaira: 'NGN 5,000.00',
      pdfBuffer,
    });

    console.log('✓ Email sent successfully!');
  } catch (error) {
    console.error('✗ Email failed:', error);
    process.exit(1);
  }
}

testBrevoEmail();
