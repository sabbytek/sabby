import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib';

// All monetary values arrive in kobo (integer). This converts to a display string.
function formatNaira(kobo: number): string {
  return `NGN ${(kobo / 100).toFixed(2)}`;
}

function formatDate(d: Date | string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-NG', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export interface InvoiceLineItem {
  variantName: string;
  sku: string;
  quantity: number;
  unitPriceKobo: number;
  discountKobo: number;
  taxKobo: number;
  lineTotalKobo: number;
}

export interface InvoiceData {
  invoiceNumber: string;
  issuedAt: Date | string;
  dueAt?: Date | string | null;
  businessName: string;
  businessEmail: string;
  businessPhone?: string | null;
  customerName: string;
  customerEmail?: string | null;
  customerPhone?: string | null;
  customerAddress?: string | null;
  items: InvoiceLineItem[];
  subtotalKobo: number;
  discountKobo: number;
  taxKobo: number;
  deliveryFeeKobo: number;
  totalKobo: number;
  paymentStatus: string;
  orderChannel: string;
}

export async function renderInvoicePdf(data: InvoiceData): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]); // A4
  const { width, height } = page.getSize();

  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const black = rgb(0.1, 0.1, 0.1);
  const grey = rgb(0.5, 0.5, 0.5);
  const accent = rgb(0.31, 0.27, 0.9); // indigo ~#4F46E5
  const white = rgb(1, 1, 1);

  let y = height - 50;
  const L = 50; // left margin
  const R = width - 50; // right edge

  function text(
    value: string,
    x: number,
    yPos: number,
    opts: { font?: PDFFont; size?: number; color?: typeof black } = {},
  ) {
    page.drawText(value, {
      x,
      y: yPos,
      size: opts.size ?? 10,
      font: opts.font ?? regular,
      color: opts.color ?? black,
    });
  }

  function line(yPos: number, lx = L, rx = R, color = grey) {
    page.drawLine({
      start: { x: lx, y: yPos },
      end: { x: rx, y: yPos },
      thickness: 0.5,
      color,
    });
  }

  // ── Header bar ────────────────────────────────────────────────────────────────
  page.drawRectangle({ x: 0, y: height - 80, width, height: 80, color: accent });
  text(data.businessName, L, height - 35, { font: bold, size: 18, color: white });
  text('INVOICE', R - 80, height - 35, { font: bold, size: 18, color: white });

  if (data.businessEmail) {
    text(data.businessEmail, L, height - 55, { size: 9, color: white });
  }
  if (data.businessPhone) {
    text(data.businessPhone, L, height - 67, { size: 9, color: white });
  }

  y = height - 100;

  // ── Invoice meta (right column) ────────────────────────────────────────────
  const metaX = 380;
  text('Invoice #', metaX, y, { font: bold, size: 9, color: grey });
  text(data.invoiceNumber, metaX + 70, y, { font: bold, size: 9 });
  y -= 16;
  text('Date', metaX, y, { size: 9, color: grey });
  text(formatDate(data.issuedAt), metaX + 70, y, { size: 9 });
  if (data.dueAt) {
    y -= 16;
    text('Due', metaX, y, { size: 9, color: grey });
    text(formatDate(data.dueAt), metaX + 70, y, { size: 9 });
  }

  // ── Bill To ────────────────────────────────────────────────────────────────
  const billY = height - 100;
  text('BILL TO', L, billY, { font: bold, size: 8, color: grey });
  let billLine = billY - 14;
  text(data.customerName, L, billLine, { font: bold, size: 10 });
  if (data.customerEmail) {
    billLine -= 13;
    text(data.customerEmail, L, billLine, { size: 9 });
  }
  if (data.customerPhone) {
    billLine -= 13;
    text(data.customerPhone, L, billLine, { size: 9 });
  }
  if (data.customerAddress) {
    // wrap long addresses crudely at 40 chars
    const addr = data.customerAddress;
    const chunks = addr.match(/.{1,40}/g) ?? [addr];
    for (const chunk of chunks) {
      billLine -= 13;
      text(chunk, L, billLine, { size: 9, color: grey });
    }
  }

  y = Math.min(y, billLine) - 28;
  line(y);

  // ── Column headers ─────────────────────────────────────────────────────────
  y -= 16;
  const colItem = L;
  const colQty = 330;
  const colUnit = 390;
  const colTotal = 480;

  text('ITEM / SKU', colItem, y, { font: bold, size: 8, color: grey });
  text('QTY', colQty, y, { font: bold, size: 8, color: grey });
  text('UNIT PRICE', colUnit, y, { font: bold, size: 8, color: grey });
  text('TOTAL', colTotal, y, { font: bold, size: 8, color: grey });
  y -= 8;
  line(y);

  // ── Line items ─────────────────────────────────────────────────────────────
  for (const item of data.items) {
    y -= 18;
    if (y < 150) break; // prevent overflow — truncate if extreme order
    text(item.variantName, colItem, y, { size: 9 });
    text(`SKU: ${item.sku}`, colItem, y - 10, { size: 7, color: grey });
    text(String(item.quantity), colQty, y, { size: 9 });
    text(formatNaira(item.unitPriceKobo), colUnit, y, { size: 9 });
    text(formatNaira(item.lineTotalKobo), colTotal, y, { size: 9 });
    y -= 10;
  }

  y -= 10;
  line(y);

  // ── Totals block ───────────────────────────────────────────────────────────
  const totLabelX = 380;
  const totValueX = 490;

  function totRow(label: string, valueKobo: number, isBold = false) {
    y -= 16;
    text(label, totLabelX, y, {
      font: isBold ? bold : regular,
      size: 9,
      color: isBold ? black : grey,
    });
    const val = formatNaira(valueKobo);
    text(val, totValueX - regular.widthOfTextAtSize(val, 9), y, {
      font: isBold ? bold : regular,
      size: 9,
      color: isBold ? black : grey,
    });
  }

  totRow('Subtotal', data.subtotalKobo);
  if (data.discountKobo > 0) totRow('Discount', -data.discountKobo);
  if (data.taxKobo > 0) totRow('Tax', data.taxKobo);
  if (data.deliveryFeeKobo > 0) totRow('Delivery', data.deliveryFeeKobo);

  y -= 6;
  line(y, totLabelX, R);
  totRow('TOTAL', data.totalKobo, true);

  // ── Payment status badge ────────────────────────────────────────────────────
  y -= 24;
  const badge = data.paymentStatus.toUpperCase();
  const badgeColor = data.paymentStatus === 'paid' ? rgb(0.1, 0.6, 0.3) : rgb(0.8, 0.5, 0.1);
  page.drawRectangle({ x: L, y: y - 4, width: 60, height: 16, color: badgeColor });
  text(badge, L + 6, y + 1, { font: bold, size: 8, color: white });

  // ── Footer ─────────────────────────────────────────────────────────────────
  y = 40;
  line(y + 10);
  text('Thank you for your business!', L, y, { size: 8, color: grey });
  text(`Channel: ${data.orderChannel}`, R - 100, y, { size: 8, color: grey });

  const bytes = await doc.save();
  return Buffer.from(bytes);
}
