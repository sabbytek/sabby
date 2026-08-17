import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib';

function formatNaira(kobo: number): string {
  return `NGN ${(kobo / 100).toFixed(2)}`;
}

function formatDate(d: Date | string): string {
  return new Date(d).toLocaleString('en-NG', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export interface ReceiptLineItem {
  variantName: string;
  sku: string;
  quantity: number;
  unitPriceKobo: number;
  lineTotalKobo: number;
}

export interface ReceiptData {
  orderNumber: string;
  issuedAt: Date | string;
  businessName: string;
  businessPhone?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  items: ReceiptLineItem[];
  subtotalKobo: number;
  discountKobo: number;
  taxKobo: number;
  deliveryFeeKobo: number;
  totalKobo: number;
  paymentStatus: string;
  channel: string;
}

// Thermal-style receipt: 72mm wide (204pt), variable height
const PAGE_WIDTH = 204;
const MARGIN = 12;
const LINE_H = 14;

export async function renderReceiptPdf(data: ReceiptData): Promise<Buffer> {
  // Calculate page height dynamically
  const itemRows = data.items.length * 2; // name row + sku/qty row
  const estimatedHeight = 260 + itemRows * LINE_H + 80;

  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_WIDTH, estimatedHeight]);

  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const black = rgb(0.05, 0.05, 0.05);
  const grey = rgb(0.5, 0.5, 0.5);

  let y = estimatedHeight - MARGIN;

  function t(
    value: string,
    x: number,
    yPos: number,
    opts: { font?: PDFFont; size?: number; color?: typeof black; align?: 'left' | 'right' } = {},
  ) {
    const font = opts.font ?? regular;
    const size = opts.size ?? 8;
    const xPos =
      opts.align === 'right' ? x - font.widthOfTextAtSize(value, size) : x;
    page.drawText(value, { x: xPos, y: yPos, size, font, color: opts.color ?? black });
  }

  function divider(yPos: number, dashed = false) {
    if (dashed) {
      // Approximate dashed line with short segments
      for (let x = MARGIN; x < PAGE_WIDTH - MARGIN; x += 6) {
        page.drawLine({
          start: { x, y: yPos },
          end: { x: x + 3, y: yPos },
          thickness: 0.4,
          color: grey,
        });
      }
    } else {
      page.drawLine({
        start: { x: MARGIN, y: yPos },
        end: { x: PAGE_WIDTH - MARGIN, y: yPos },
        thickness: 0.5,
        color: black,
      });
    }
  }

  // ── Business name ──────────────────────────────────────────────────────────
  const nameWidth = bold.widthOfTextAtSize(data.businessName, 11);
  t(data.businessName, (PAGE_WIDTH - nameWidth) / 2, y, { font: bold, size: 11 });
  y -= LINE_H + 2;

  if (data.businessPhone) {
    const phoneWidth = regular.widthOfTextAtSize(data.businessPhone, 7);
    t(data.businessPhone, (PAGE_WIDTH - phoneWidth) / 2, y, { size: 7, color: grey });
    y -= LINE_H;
  }

  // ── RECEIPT label ──────────────────────────────────────────────────────────
  const label = 'RECEIPT';
  const labelWidth = bold.widthOfTextAtSize(label, 9);
  t(label, (PAGE_WIDTH - labelWidth) / 2, y, { font: bold, size: 9 });
  y -= LINE_H;

  divider(y);
  y -= LINE_H;

  // ── Order meta ─────────────────────────────────────────────────────────────
  t('Order:', MARGIN, y, { color: grey, size: 7 });
  t(data.orderNumber, PAGE_WIDTH - MARGIN, y, { font: bold, size: 7, align: 'right' });
  y -= LINE_H;

  t('Date:', MARGIN, y, { color: grey, size: 7 });
  t(formatDate(data.issuedAt), PAGE_WIDTH - MARGIN, y, { size: 7, align: 'right' });
  y -= LINE_H;

  if (data.customerName) {
    t('Customer:', MARGIN, y, { color: grey, size: 7 });
    t(data.customerName, PAGE_WIDTH - MARGIN, y, { size: 7, align: 'right' });
    y -= LINE_H;
  }

  divider(y, true);
  y -= LINE_H;

  // ── Column headers ─────────────────────────────────────────────────────────
  t('ITEM', MARGIN, y, { font: bold, size: 7, color: grey });
  t('QTY', 130, y, { font: bold, size: 7, color: grey });
  t('TOTAL', PAGE_WIDTH - MARGIN, y, { font: bold, size: 7, color: grey, align: 'right' });
  y -= LINE_H - 2;

  divider(y, true);
  y -= LINE_H;

  // ── Line items ─────────────────────────────────────────────────────────────
  for (const item of data.items) {
    t(item.variantName.slice(0, 22), MARGIN, y, { size: 7 });
    t(String(item.quantity), 130, y, { size: 7 });
    t(formatNaira(item.lineTotalKobo), PAGE_WIDTH - MARGIN, y, { size: 7, align: 'right' });
    y -= LINE_H - 2;
    t(`SKU: ${item.sku}`, MARGIN + 4, y, { size: 6, color: grey });
    y -= LINE_H;
  }

  divider(y, true);
  y -= LINE_H;

  // ── Totals ─────────────────────────────────────────────────────────────────
  function totRow(label: string, kobo: number, isBold = false) {
    t(label, MARGIN, y, { font: isBold ? bold : regular, size: 7, color: isBold ? black : grey });
    t(formatNaira(kobo), PAGE_WIDTH - MARGIN, y, {
      font: isBold ? bold : regular,
      size: 7,
      color: isBold ? black : grey,
      align: 'right',
    });
    y -= LINE_H;
  }

  totRow('Subtotal', data.subtotalKobo);
  if (data.discountKobo > 0) totRow('Discount', -data.discountKobo);
  if (data.taxKobo > 0) totRow('Tax (VAT)', data.taxKobo);
  if (data.deliveryFeeKobo > 0) totRow('Delivery', data.deliveryFeeKobo);

  divider(y);
  y -= LINE_H;
  totRow('TOTAL', data.totalKobo, true);

  // ── Payment status ─────────────────────────────────────────────────────────
  const statusText = `Payment: ${data.paymentStatus.toUpperCase()}`;
  const statusWidth = bold.widthOfTextAtSize(statusText, 8);
  const statusColor = data.paymentStatus === 'paid' ? rgb(0.1, 0.6, 0.3) : rgb(0.8, 0.4, 0.1);
  t(statusText, (PAGE_WIDTH - statusWidth) / 2, y, { font: bold, size: 8, color: statusColor });
  y -= LINE_H + 4;

  // ── Footer ─────────────────────────────────────────────────────────────────
  divider(y, true);
  y -= LINE_H;
  const thanks = 'Thank you for your purchase!';
  const thanksWidth = regular.widthOfTextAtSize(thanks, 7);
  t(thanks, (PAGE_WIDTH - thanksWidth) / 2, y, { size: 7, color: grey });

  const bytes = await doc.save();
  return Buffer.from(bytes);
}
