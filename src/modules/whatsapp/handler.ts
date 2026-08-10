import { eq, and } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { withTenantSchema } from '../../shared/db/tenant.js';
import {
  categories,
  productVariants,
  products,
  customers,
} from '../../shared/db/schema/tenant.js';
import { createOrder } from '../orders/service.js';
import { initiatePayment } from '../payments/service.js';
import {
  getSession,
  saveSession,
  clearSession,
  type WhatsAppSession,
  type CartItem,
} from './session.js';
import {
  sendText,
  sendList,
  sendButtons,
  formatNaira,
  type ListRow,
} from './sender.js';

// ─── Entry point ──────────────────────────────────────────────────────────────

export async function handleInboundMessage(
  phoneNumberId: string,
  from: string,
  tenantId: string,
  schemaName: string,
  messageType: string,
  messageBody: string,
  interactiveId: string | null,
): Promise<void> {
  let session = await getSession(phoneNumberId, from);

  // New session or expired
  if (!session) {
    session = {
      state: 'greeting',
      tenantId,
      schemaName,
      cart: [],
    };
  }

  // Global shortcut: "cart" at any point
  const bodyLower = messageBody.trim().toLowerCase();
  if (bodyLower === 'cart' && session.state !== 'checkout_name' && session.state !== 'checkout_address') {
    session.state = 'cart';
  }

  // Global shortcut: "menu" / "start" / "hi" resets to greeting
  if (['hi', 'hello', 'menu', 'start', '0'].includes(bodyLower) && session.state === 'greeting') {
    await handleGreeting(phoneNumberId, from, session, schemaName);
    return;
  }

  switch (session.state) {
    case 'greeting':
      await handleGreeting(phoneNumberId, from, session, schemaName);
      break;
    case 'browsing':
      await handleBrowsing(phoneNumberId, from, session, schemaName, interactiveId);
      break;
    case 'products':
      await handleProducts(phoneNumberId, from, session, schemaName, interactiveId);
      break;
    case 'product_detail':
      await handleProductDetail(phoneNumberId, from, session, schemaName, interactiveId);
      break;
    case 'cart':
      await handleCart(phoneNumberId, from, session, interactiveId);
      break;
    case 'checkout_name':
      await handleCheckoutName(phoneNumberId, from, session, messageBody);
      break;
    case 'checkout_address':
      await handleCheckoutAddress(phoneNumberId, from, session, tenantId, schemaName, messageBody);
      break;
    case 'awaiting_payment':
      await sendText(phoneNumberId, from, 'Your order is still pending payment. Please use the payment link sent earlier to complete your purchase.');
      break;
    case 'confirmed':
      await clearSession(phoneNumberId, from);
      await handleGreeting(phoneNumberId, from, { ...session, state: 'greeting', cart: [] }, schemaName);
      break;
  }
}

// ─── State handlers ───────────────────────────────────────────────────────────

async function handleGreeting(
  phoneNumberId: string,
  from: string,
  session: WhatsAppSession,
  schemaName: string,
): Promise<void> {
  const cats = await withTenantSchema(schemaName, async (db) =>
    db.select({ id: categories.id, name: categories.name })
      .from(categories)
      .limit(10),
  );

  if (cats.length === 0) {
    await sendText(phoneNumberId, from, 'Welcome! Our store is being set up. Please check back soon.');
    return;
  }

  const rows: ListRow[] = cats.map((c) => ({ id: `cat:${c.id}`, title: c.name }));
  const updated: WhatsAppSession = { ...session, state: 'browsing', cart: session.cart };
  await saveSession(phoneNumberId, from, updated);

  await sendList(
    phoneNumberId, from,
    'Welcome! Browse our product categories below:',
    'Browse',
    [{ title: 'Categories', rows }],
  );
}

async function handleBrowsing(
  phoneNumberId: string,
  from: string,
  session: WhatsAppSession,
  schemaName: string,
  interactiveId: string | null,
): Promise<void> {
  if (!interactiveId?.startsWith('cat:')) {
    await sendText(phoneNumberId, from, 'Please select a category from the list. Type "menu" to restart.');
    return;
  }

  const categoryId = interactiveId.replace('cat:', '');

  const variants = await withTenantSchema(schemaName, async (db) =>
    db
      .select({
        id: productVariants.id,
        name: productVariants.name,
        priceKobo: productVariants.priceKobo,
        productName: products.name,
      })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(
        and(
          eq(products.categoryId, categoryId),
          eq(products.isActive, true),
          eq(productVariants.isActive, true),
        ),
      )
      .limit(10),
  );

  if (variants.length === 0) {
    await sendText(phoneNumberId, from, 'No products found in this category. Type "menu" to browse other categories.');
    return;
  }

  const rows: ListRow[] = variants.map((v) => ({
    id: `var:${v.id}`,
    title: `${v.productName} – ${v.name}`,
    description: formatNaira(v.priceKobo),
  }));

  const updated: WhatsAppSession = { ...session, state: 'products', selectedCategoryId: categoryId };
  await saveSession(phoneNumberId, from, updated);

  await sendList(
    phoneNumberId, from,
    'Select a product to view details:',
    'Select',
    [{ title: 'Products', rows }],
  );
}

async function handleProducts(
  phoneNumberId: string,
  from: string,
  session: WhatsAppSession,
  schemaName: string,
  interactiveId: string | null,
): Promise<void> {
  if (!interactiveId?.startsWith('var:')) {
    await sendText(phoneNumberId, from, 'Please select a product from the list. Type "menu" to restart.');
    return;
  }

  const variantId = interactiveId.replace('var:', '');

  const [variant] = await withTenantSchema(schemaName, async (db) =>
    db
      .select({
        id: productVariants.id,
        name: productVariants.name,
        priceKobo: productVariants.priceKobo,
        productName: products.name,
      })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(eq(productVariants.id, variantId))
      .limit(1),
  );

  if (!variant) {
    await sendText(phoneNumberId, from, 'Product not found. Type "menu" to restart.');
    return;
  }

  const updated: WhatsAppSession = { ...session, state: 'product_detail', selectedVariantId: variantId };
  await saveSession(phoneNumberId, from, updated);

  await sendButtons(
    phoneNumberId, from,
    `*${variant.productName} – ${variant.name}*\nPrice: ${formatNaira(variant.priceKobo)}\n\nWould you like to add this to your cart?`,
    [
      { id: `add:${variantId}`, title: 'Add to Cart' },
      { id: 'view-cart', title: 'View Cart' },
    ],
  );
}

async function handleProductDetail(
  phoneNumberId: string,
  from: string,
  session: WhatsAppSession,
  schemaName: string,
  interactiveId: string | null,
): Promise<void> {
  if (interactiveId === 'view-cart') {
    session.state = 'cart';
    await handleCart(phoneNumberId, from, session, null);
    return;
  }

  if (!interactiveId?.startsWith('add:')) {
    await sendText(phoneNumberId, from, 'Please use the buttons above. Type "menu" to restart.');
    return;
  }

  const variantId = interactiveId.replace('add:', '');

  const [variant] = await withTenantSchema(schemaName, async (db) =>
    db
      .select({
        id: productVariants.id,
        name: productVariants.name,
        priceKobo: productVariants.priceKobo,
        productName: products.name,
      })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(eq(productVariants.id, variantId))
      .limit(1),
  );

  if (!variant) {
    await sendText(phoneNumberId, from, 'Product not found. Type "menu" to restart.');
    return;
  }

  const existingIdx = session.cart.findIndex((i) => i.variantId === variantId);
  let updatedCart: CartItem[];

  if (existingIdx >= 0) {
    updatedCart = session.cart.map((item, idx) =>
      idx === existingIdx ? { ...item, quantity: item.quantity + 1 } : item,
    );
  } else {
    const newItem: CartItem = {
      variantId,
      productName: variant.productName,
      variantName: variant.name,
      priceKobo: variant.priceKobo,
      quantity: 1,
    };
    updatedCart = [...session.cart, newItem];
  }

  const updated: WhatsAppSession = { ...session, state: 'cart', cart: updatedCart };
  await saveSession(phoneNumberId, from, updated);

  await handleCart(phoneNumberId, from, updated, null);
}

async function handleCart(
  phoneNumberId: string,
  from: string,
  session: WhatsAppSession,
  interactiveId: string | null,
): Promise<void> {
  if (interactiveId === 'checkout') {
    const updated: WhatsAppSession = { ...session, state: 'checkout_name' };
    await saveSession(phoneNumberId, from, updated);
    await sendText(phoneNumberId, from, 'Great! Please enter your full name:');
    return;
  }

  if (interactiveId === 'browse-more') {
    const updated: WhatsAppSession = { ...session, state: 'browsing' };
    await saveSession(phoneNumberId, from, updated);
    await handleGreeting(phoneNumberId, from, updated, session.schemaName);
    return;
  }

  if (session.cart.length === 0) {
    await sendText(phoneNumberId, from, 'Your cart is empty. Type "menu" to browse products.');
    const updated: WhatsAppSession = { ...session, state: 'greeting' };
    await saveSession(phoneNumberId, from, updated);
    return;
  }

  const total = session.cart.reduce((sum, i) => sum + i.priceKobo * i.quantity, 0);
  const lines = session.cart.map((i) => `• ${i.productName} – ${i.variantName} x${i.quantity}: ${formatNaira(i.priceKobo * i.quantity)}`).join('\n');
  const cartText = `🛒 *Your Cart*\n\n${lines}\n\n*Total: ${formatNaira(total)}*`;

  const updated: WhatsAppSession = { ...session, state: 'cart' };
  await saveSession(phoneNumberId, from, updated);

  await sendButtons(
    phoneNumberId, from,
    cartText,
    [
      { id: 'checkout', title: 'Checkout' },
      { id: 'browse-more', title: 'Continue Shopping' },
    ],
  );
}

async function handleCheckoutName(
  phoneNumberId: string,
  from: string,
  session: WhatsAppSession,
  messageBody: string,
): Promise<void> {
  const name = messageBody.trim();
  if (name.length < 2) {
    await sendText(phoneNumberId, from, 'Please enter your full name (at least 2 characters):');
    return;
  }

  const updated: WhatsAppSession = { ...session, state: 'checkout_address', customerName: name };
  await saveSession(phoneNumberId, from, updated);
  await sendText(phoneNumberId, from, 'Please enter your delivery address:');
}

async function handleCheckoutAddress(
  phoneNumberId: string,
  from: string,
  session: WhatsAppSession,
  tenantId: string,
  schemaName: string,
  messageBody: string,
): Promise<void> {
  const address = messageBody.trim();
  if (address.length < 5) {
    await sendText(phoneNumberId, from, 'Please enter a valid delivery address:');
    return;
  }

  const customerName = session.customerName ?? 'WhatsApp Customer';

  // Find or create customer record
  const customerId = await withTenantSchema(schemaName, async (db) => {
    const [existing] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.phone, from))
      .limit(1);

    if (existing) return existing.id;

    const [first, ...rest] = customerName.split(' ');
    const lastName = rest.join(' ') || '-';
    const newId = uuidv4();
    await db.insert(customers).values({
      id: newId,
      firstName: first ?? customerName,
      lastName,
      phone: from,
      consentGivenAt: new Date(),
      consentSource: 'whatsapp_chat',
    });
    return newId;
  });

  // Create draft order
  const order = await createOrder(schemaName, 'whatsapp', {
    customerId,
    channel: 'whatsapp',
    note: `Delivery: ${address}`,
    items: session.cart.map((item) => ({
      variantId: item.variantId,
      quantity: item.quantity,
      unitPriceKobo: item.priceKobo,
    })),
  });

  // Initiate payment — use WhatsApp customer phone as email placeholder
  const customerEmail = `${from.replace('+', '')}@wa.bpos.ng`;
  const { authorizationUrl, reference } = await initiatePayment(
    schemaName,
    order.id,
    'whatsapp',
    customerEmail,
  );

  const updated: WhatsAppSession = {
    ...session,
    state: 'awaiting_payment',
    customerAddress: address,
    orderId: order.id,
    paymentReference: reference,
  };
  await saveSession(phoneNumberId, from, updated);

  const total = session.cart.reduce((sum, i) => sum + i.priceKobo * i.quantity, 0);
  await sendText(
    phoneNumberId, from,
    `Order confirmed! 🎉\n\nOrder #${order.orderNumber}\nTotal: ${formatNaira(total)}\n\nComplete your payment here:\n${authorizationUrl}\n\nYour order will be processed after payment. Thank you, ${customerName}!`,
  );
}

// ─── Order confirmation (called from payment webhook) ─────────────────────────

export async function confirmWhatsAppOrder(
  phoneNumberId: string,
  customerPhone: string,
  orderNumber: string,
): Promise<void> {
  const session = await getSession(phoneNumberId, customerPhone);
  if (!session) return;

  await sendText(
    phoneNumberId, customerPhone,
    `✅ Payment received! Your order *${orderNumber}* is confirmed and being processed. Thank you for shopping with us!`,
  );

  await clearSession(phoneNumberId, customerPhone);
}
