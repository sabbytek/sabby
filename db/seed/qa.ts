/**
 * QA seed script — creates 2 realistic demo tenants with products, customers,
 * orders, inventory, and ledger entries for manual testing and QA.
 *
 * Run: npx tsx db/seed/qa.ts
 *
 * Idempotent on slugs: re-running skips tenants that already exist.
 */
import { v4 as uuidv4 } from 'uuid';
import argon2 from 'argon2';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../../src/shared/db/client.js';
import { tenants } from '../../src/shared/db/schema/public.js';
import {
  provisionTenantSchema,
  withTenantSchema,
  tenantSchemaName,
} from '../../src/shared/db/tenant.js';
import { runTenantMigrations } from '../../src/shared/db/migrate-tenant.js';
import {
  users,
  locations,
  ledgerAccounts,
  categories,
  products,
  productVariants,
  inventory,
  stockMovements,
  customers,
  orders,
  orderItems,
  payments,
  journalEntries,
  journalLines,
  expenses,
} from '../../src/shared/db/schema/tenant.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function kobo(naira: number): number {
  return Math.round(naira * 100);
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ─── Tenant definitions ───────────────────────────────────────────────────────

const TENANTS = [
  {
    slug: 'kemis-electronics-qa',
    name: "Kemi's Electronics",
    businessEmail: 'kemi@kemiselectronics.ng',
    ownerFirstName: 'Kemi',
    ownerLastName: 'Adeyemi',
    ownerPassword: 'QAPassword1!',
    planTier: 'growth' as const,
  },
  {
    slug: 'lagos-fashion-qa',
    name: 'Lagos Fashion House',
    businessEmail: 'admin@lagosfashion.ng',
    ownerFirstName: 'Tunde',
    ownerLastName: 'Okafor',
    ownerPassword: 'QAPassword2!',
    planTier: 'entry' as const,
  },
];

// ─── Product catalogue for Kemi's Electronics ─────────────────────────────────

const ELECTRONICS_CATALOGUE = [
  {
    name: 'iPhone 15 Pro',
    category: 'Smartphones',
    variants: [
      { sku: 'IP15P-128-BLK', name: '128GB Black Titanium', priceNaira: 1450000, costNaira: 1100000 },
      { sku: 'IP15P-256-BLK', name: '256GB Black Titanium', priceNaira: 1650000, costNaira: 1250000 },
      { sku: 'IP15P-256-WHT', name: '256GB White Titanium', priceNaira: 1650000, costNaira: 1250000 },
    ],
  },
  {
    name: 'Samsung Galaxy S24',
    category: 'Smartphones',
    variants: [
      { sku: 'SGS24-256-BLK', name: '256GB Onyx Black', priceNaira: 850000, costNaira: 620000 },
      { sku: 'SGS24-256-PRP', name: '256GB Cobalt Violet', priceNaira: 850000, costNaira: 620000 },
    ],
  },
  {
    name: 'AirPods Pro 2nd Gen',
    category: 'Audio',
    variants: [
      { sku: 'APP2-WHT', name: 'White USB-C', priceNaira: 250000, costNaira: 175000 },
    ],
  },
  {
    name: 'MacBook Air M2',
    category: 'Laptops',
    variants: [
      { sku: 'MBA-M2-8-256', name: '8GB/256GB Midnight', priceNaira: 1350000, costNaira: 980000 },
      { sku: 'MBA-M2-8-512', name: '8GB/512GB Silver', priceNaira: 1600000, costNaira: 1180000 },
      { sku: 'MBA-M2-16-512', name: '16GB/512GB Space Gray', priceNaira: 1850000, costNaira: 1380000 },
    ],
  },
  {
    name: 'Anker PowerCore 26800',
    category: 'Accessories',
    variants: [
      { sku: 'APC-26800-BLK', name: 'Black 26800mAh', priceNaira: 35000, costNaira: 18000 },
      { sku: 'APC-26800-WHT', name: 'White 26800mAh', priceNaira: 35000, costNaira: 18000 },
    ],
  },
  {
    name: 'USB-C Hub 7-in-1',
    category: 'Accessories',
    variants: [
      { sku: 'USBC-7N1-SLV', name: 'Silver Aluminium', priceNaira: 28000, costNaira: 12000 },
    ],
  },
  {
    name: 'iPad Air 5th Gen',
    category: 'Tablets',
    variants: [
      { sku: 'IPAD-A5-64-BLU', name: '64GB Blue WiFi', priceNaira: 780000, costNaira: 560000 },
      { sku: 'IPAD-A5-256-BLU', name: '256GB Blue WiFi', priceNaira: 980000, costNaira: 700000 },
    ],
  },
  {
    name: 'Sony WH-1000XM5',
    category: 'Audio',
    variants: [
      { sku: 'SONY-XM5-BLK', name: 'Black', priceNaira: 195000, costNaira: 130000 },
      { sku: 'SONY-XM5-SLV', name: 'Silver', priceNaira: 195000, costNaira: 130000 },
    ],
  },
];

// ─── Product catalogue for Lagos Fashion House ────────────────────────────────

const FASHION_CATALOGUE = [
  {
    name: 'Ankara Maxi Dress',
    category: 'Dresses',
    variants: [
      { sku: 'AMD-S-RED', name: 'Small Red Floral', priceNaira: 18500, costNaira: 8000 },
      { sku: 'AMD-M-RED', name: 'Medium Red Floral', priceNaira: 18500, costNaira: 8000 },
      { sku: 'AMD-L-RED', name: 'Large Red Floral', priceNaira: 18500, costNaira: 8000 },
      { sku: 'AMD-XL-RED', name: 'XL Red Floral', priceNaira: 20000, costNaira: 9000 },
    ],
  },
  {
    name: 'Agbada 3-Piece Set',
    category: 'Mens Traditional',
    variants: [
      { sku: 'AGD-M-WHT', name: 'Medium White', priceNaira: 45000, costNaira: 22000 },
      { sku: 'AGD-L-WHT', name: 'Large White', priceNaira: 45000, costNaira: 22000 },
      { sku: 'AGD-XL-GLD', name: 'XL Gold', priceNaira: 55000, costNaira: 28000 },
    ],
  },
  {
    name: 'Aso-Oke Headtie',
    category: 'Accessories',
    variants: [
      { sku: 'ASOKE-GLD', name: 'Gold Weave', priceNaira: 12000, costNaira: 4500 },
      { sku: 'ASOKE-BLU', name: 'Royal Blue Weave', priceNaira: 12000, costNaira: 4500 },
      { sku: 'ASOKE-PNK', name: 'Rose Pink Weave', priceNaira: 12000, costNaira: 4500 },
    ],
  },
  {
    name: 'Linen Senator Suit',
    category: 'Mens Traditional',
    variants: [
      { sku: 'LSS-M-BRN', name: 'Medium Brown', priceNaira: 32000, costNaira: 14000 },
      { sku: 'LSS-L-BRN', name: 'Large Brown', priceNaira: 32000, costNaira: 14000 },
      { sku: 'LSS-M-GRN', name: 'Medium Olive Green', priceNaira: 32000, costNaira: 14000 },
    ],
  },
  {
    name: 'Adire Blouse',
    category: 'Tops',
    variants: [
      { sku: 'ADI-S-IND', name: 'Small Indigo', priceNaira: 9500, costNaira: 3500 },
      { sku: 'ADI-M-IND', name: 'Medium Indigo', priceNaira: 9500, costNaira: 3500 },
      { sku: 'ADI-L-IND', name: 'Large Indigo', priceNaira: 9500, costNaira: 3500 },
    ],
  },
];

// ─── Customers ────────────────────────────────────────────────────────────────

const CUSTOMERS = [
  { firstName: 'Chioma', lastName: 'Eze', email: 'chioma.eze@gmail.com', phone: '08012345678' },
  { firstName: 'Emeka', lastName: 'Nwosu', email: 'emeka.nwosu@yahoo.com', phone: '07098765432' },
  { firstName: 'Fatima', lastName: 'Bello', email: 'fatima.bello@hotmail.com', phone: '09011223344' },
  { firstName: 'Segun', lastName: 'Adeleke', email: 'segun.adeleke@gmail.com', phone: '08123456789' },
  { firstName: 'Ngozi', lastName: 'Okonkwo', email: 'ngozi.okonkwo@gmail.com', phone: '07011234567' },
  { firstName: 'Bayo', lastName: 'Oluwole', email: 'bayo.oluwole@outlook.com', phone: '08087654321' },
  { firstName: 'Amaka', lastName: 'Igwe', email: 'amaka.igwe@gmail.com', phone: '09056789012' },
  { firstName: 'Dipo', lastName: 'Fashola', email: 'dipo.fashola@gmail.com', phone: '08034567890' },
];

// ─── Seed a single tenant ─────────────────────────────────────────────────────

async function seedTenant(
  tenantDef: (typeof TENANTS)[number],
  catalogue: typeof ELECTRONICS_CATALOGUE,
) {
  console.log(`\n📦 Seeding tenant: ${tenantDef.name}`);

  // Check if already exists
  const [existing] = await db
    .select({ id: tenants.id, schemaName: tenants.schemaName })
    .from(tenants)
    .where(eq(tenants.slug, tenantDef.slug))
    .limit(1);

  let tenantId: string;
  let schemaName: string;

  if (existing) {
    console.log(`  ↳ Tenant already exists — skipping provisioning`);
    tenantId = existing.id;
    schemaName = existing.schemaName;
  } else {
    tenantId = uuidv4();
    schemaName = tenantSchemaName(tenantId);

    await db.insert(tenants).values({
      id: tenantId,
      name: tenantDef.name,
      slug: tenantDef.slug,
      schemaName,
      businessEmail: tenantDef.businessEmail,
      planTier: tenantDef.planTier,
      subscriptionStatus: 'active',
    });

    await provisionTenantSchema(schemaName);
    await runTenantMigrations(schemaName);
    console.log(`  ↳ Schema provisioned: ${schemaName}`);
  }

  await withTenantSchema(schemaName, async (db) => {
    // ── Owner user ──────────────────────────────────────────────────────────
    const [existingOwner] = await db
      .select({ id: users.id })
      .from(users)
      .limit(1);

    let ownerId: string;
    if (existingOwner) {
      ownerId = existingOwner.id;
      console.log(`  ↳ Owner already exists`);
    } else {
      ownerId = uuidv4();
      const passwordHash = await argon2.hash(tenantDef.ownerPassword);
      await db.insert(users).values({
        id: ownerId,
        email: tenantDef.businessEmail,
        passwordHash,
        firstName: tenantDef.ownerFirstName,
        lastName: tenantDef.ownerLastName,
        role: 'owner',
      });
      console.log(`  ↳ Owner created: ${tenantDef.businessEmail}`);
    }

    // ── Staff users ─────────────────────────────────────────────────────────
    const staffHash = await argon2.hash('Staff123!');
    const staffIds: string[] = [];

    const [existingStaff] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.role, 'staff'))
      .limit(1);

    if (!existingStaff) {
      for (const s of [
        { firstName: 'Adaeze', lastName: 'Obi', email: `staff1@${tenantDef.slug}.ng` },
        { firstName: 'Kunle', lastName: 'Adesanya', email: `staff2@${tenantDef.slug}.ng` },
      ]) {
        const sid = uuidv4();
        staffIds.push(sid);
        await db.insert(users).values({
          id: sid,
          email: s.email,
          passwordHash: staffHash,
          firstName: s.firstName,
          lastName: s.lastName,
          role: 'staff',
        });
      }
      console.log(`  ↳ Staff created: ${staffIds.length} members`);
    } else {
      staffIds.push(existingStaff.id);
    }

    // ── Default location + second location ─────────────────────────────────
    const [existingLocation] = await db.select({ id: locations.id }).from(locations).limit(1);
    let mainLocationId: string;
    let branchLocationId: string;

    if (existingLocation) {
      mainLocationId = existingLocation.id;
      const [loc2] = await db
        .select({ id: locations.id })
        .from(locations)
        .where(eq(locations.isDefault, false))
        .limit(1);
      branchLocationId = loc2?.id ?? mainLocationId;
    } else {
      mainLocationId = uuidv4();
      branchLocationId = uuidv4();

      await db.insert(locations).values([
        { id: mainLocationId, name: 'Main Store', address: '45 Broad Street, Lagos Island', isDefault: true },
        { id: branchLocationId, name: 'Ikeja Branch', address: '12 Allen Avenue, Ikeja', isDefault: false },
      ]);
      console.log(`  ↳ Locations created`);
    }

    // ── Chart of accounts ───────────────────────────────────────────────────
    const [existingAccount] = await db.select({ id: ledgerAccounts.id }).from(ledgerAccounts).limit(1);
    let cashAccountId: string;
    let revenueAccountId: string;
    let feesAccountId: string;
    let opexAccountId: string;
    let refundsAccountId: string;

    if (existingAccount) {
      const accountRows = await db.select().from(ledgerAccounts);
      const byCode = new Map(accountRows.map((a) => [a.code, a.id]));
      cashAccountId = byCode.get('1000')!;
      revenueAccountId = byCode.get('4000')!;
      feesAccountId = byCode.get('5100')!;
      opexAccountId = byCode.get('5200')!;
      refundsAccountId = byCode.get('5300')!;
    } else {
      cashAccountId = uuidv4();
      revenueAccountId = uuidv4();
      feesAccountId = uuidv4();
      opexAccountId = uuidv4();
      refundsAccountId = uuidv4();

      await db.insert(ledgerAccounts).values([
        { id: cashAccountId,     code: '1000', name: 'Cash',                     type: 'asset',   isSystem: true },
        { id: uuidv4(),          code: '1100', name: 'Accounts Receivable',       type: 'asset',   isSystem: true },
        { id: uuidv4(),          code: '2000', name: 'Accounts Payable',          type: 'liability', isSystem: true },
        { id: uuidv4(),          code: '3000', name: 'Owner Equity',              type: 'equity',  isSystem: true },
        { id: revenueAccountId,  code: '4000', name: 'Revenue',                  type: 'revenue', isSystem: true },
        { id: uuidv4(),          code: '5000', name: 'Cost of Goods Sold',        type: 'expense', isSystem: true },
        { id: feesAccountId,     code: '5100', name: 'Payment Processing Fees',   type: 'expense', isSystem: true },
        { id: opexAccountId,     code: '5200', name: 'Operating Expenses',        type: 'expense', isSystem: true },
        { id: refundsAccountId,  code: '5300', name: 'Refunds',                   type: 'expense', isSystem: true },
      ]);
      console.log(`  ↳ Chart of accounts seeded`);
    }

    // ── Categories + products + variants ────────────────────────────────────
    const [existingCat] = await db.select({ id: categories.id }).from(categories).limit(1);
    const variantIds: string[] = [];

    if (!existingCat) {
      const categoryMap = new Map<string, string>();

      for (const item of catalogue) {
        if (!categoryMap.has(item.category)) {
          const catId = uuidv4();
          categoryMap.set(item.category, catId);
          await db.insert(categories).values({ id: catId, name: item.category });
        }

        const productId = uuidv4();
        await db.insert(products).values({
          id: productId,
          name: item.name,
          categoryId: categoryMap.get(item.category),
          hasVariants: item.variants.length > 1,
          isActive: true,
        });

        for (const v of item.variants) {
          const variantId = uuidv4();
          variantIds.push(variantId);
          await db.insert(productVariants).values({
            id: variantId,
            productId,
            sku: v.sku,
            name: v.name,
            priceKobo: kobo(v.priceNaira),
            costKobo: kobo(v.costNaira),
            taxRateBps: 750, // Nigeria 7.5% VAT
            isActive: true,
          });
        }
      }

      console.log(`  ↳ Products seeded: ${catalogue.length} products, ${variantIds.length} variants`);

      // ── Inventory for each variant × location ──────────────────────────────
      for (const vId of variantIds) {
        const qtyMain = randomBetween(5, 50);
        const qtyBranch = randomBetween(2, 20);

        await db.insert(inventory).values([
          { id: uuidv4(), variantId: vId, locationId: mainLocationId, quantityOnHand: qtyMain, lowStockThreshold: 5 },
          { id: uuidv4(), variantId: vId, locationId: branchLocationId, quantityOnHand: qtyBranch, lowStockThreshold: 3 },
        ]);

        // Stock receive movement
        await db.insert(stockMovements).values([
          {
            id: uuidv4(), variantId: vId, locationId: mainLocationId,
            type: 'receive', quantity: qtyMain, referenceType: 'purchase_order',
            referenceId: `PO-SEED-001`, createdBy: ownerId,
          },
          {
            id: uuidv4(), variantId: vId, locationId: branchLocationId,
            type: 'receive', quantity: qtyBranch, referenceType: 'purchase_order',
            referenceId: `PO-SEED-002`, createdBy: ownerId,
          },
        ]);
      }
      console.log(`  ↳ Inventory seeded for ${variantIds.length * 2} variant-location pairs`);
    } else {
      // Load existing variant IDs for order seeding
      const existingVariants = await db.select({ id: productVariants.id }).from(productVariants);
      variantIds.push(...existingVariants.map((v) => v.id));
    }

    // ── Customers ───────────────────────────────────────────────────────────
    const [existingCustomer] = await db.select({ id: customers.id }).from(customers).limit(1);
    const customerIds: string[] = [];

    if (!existingCustomer) {
      for (const c of CUSTOMERS) {
        const cid = uuidv4();
        customerIds.push(cid);
        await db.insert(customers).values({
          id: cid,
          firstName: c.firstName,
          lastName: c.lastName,
          email: c.email,
          phone: c.phone,
          consentGivenAt: daysAgo(randomBetween(30, 180)),
          consentSource: ['pos_signup', 'whatsapp_chat', 'web_checkout', 'manual'][randomBetween(0, 3)],
        });
      }
      console.log(`  ↳ Customers seeded: ${customerIds.length}`);
    } else {
      const existingCustomers = await db.select({ id: customers.id }).from(customers);
      customerIds.push(...existingCustomers.map((c) => c.id));
    }

    // ── Orders ──────────────────────────────────────────────────────────────
    const [existingOrder] = await db.select({ id: orders.id }).from(orders).limit(1);
    if (existingOrder) {
      console.log(`  ↳ Orders already exist — skipping`);
      return;
    }

    const orderConfigs: Array<{
      status: 'draft' | 'confirmed' | 'processing' | 'fulfilled' | 'cancelled';
      daysAgoCreated: number;
      channel: string;
      withPayment: boolean;
    }> = [
      // Recent fulfilled orders — form the bulk of revenue
      ...Array.from({ length: 10 }, (_, i) => ({
        status: 'fulfilled' as const,
        daysAgoCreated: i + 1,
        channel: ['pos', 'website', 'whatsapp', 'manual'][randomBetween(0, 3)],
        withPayment: true,
      })),
      // Confirmed and in processing
      { status: 'confirmed', daysAgoCreated: 0, channel: 'pos', withPayment: false },
      { status: 'processing', daysAgoCreated: 1, channel: 'website', withPayment: true },
      // Drafts — not yet confirmed
      { status: 'draft', daysAgoCreated: 0, channel: 'manual', withPayment: false },
      { status: 'draft', daysAgoCreated: 1, channel: 'pos', withPayment: false },
      // Cancelled
      { status: 'cancelled', daysAgoCreated: 5, channel: 'website', withPayment: false },
      { status: 'cancelled', daysAgoCreated: 8, channel: 'whatsapp', withPayment: false },
    ];

    let orderCount = 0;
    const orderStatusCount = await db
      .select({ count: import('drizzle-orm').then(d => d.sql<string>`count(*)`) })
      .from(orders);

    for (const cfg of orderConfigs) {
      if (variantIds.length === 0) break;

      const numItems = randomBetween(1, 3);
      const selectedVariants = variantIds
        .sort(() => 0.5 - Math.random())
        .slice(0, Math.min(numItems, variantIds.length));

      // Fetch variant prices
      const variantRows = await db
        .select({ id: productVariants.id, priceKobo: productVariants.priceKobo, taxRateBps: productVariants.taxRateBps })
        .from(productVariants)
        .where(inArray(productVariants.id, selectedVariants));

      const itemInputs = variantRows.map((v) => {
        const qty = randomBetween(1, 3);
        const taxKobo = Math.floor(qty * v.priceKobo * (v.taxRateBps ?? 0) / 10000);
        return {
          variantId: v.id,
          quantity: qty,
          unitPriceKobo: v.priceKobo,
          discountKobo: 0,
          taxKobo,
          lineTotalKobo: qty * v.priceKobo + taxKobo,
        };
      });

      const subtotalKobo = itemInputs.reduce((s, i) => s + i.quantity * i.unitPriceKobo, 0);
      const totalTaxKobo = itemInputs.reduce((s, i) => s + i.taxKobo, 0);
      const totalKobo = subtotalKobo + totalTaxKobo;

      const orderId = uuidv4();
      const orderNum = `ORD-${String(++orderCount).padStart(6, '0')}`;
      const createdAt = daysAgo(cfg.daysAgoCreated);
      const customerId = customerIds[randomBetween(0, customerIds.length - 1)] ?? null;
      const staffId = staffIds[randomBetween(0, staffIds.length - 1)] ?? ownerId;

      await db.insert(orders).values({
        id: orderId,
        orderNumber: orderNum,
        customerId,
        locationId: mainLocationId,
        assignedTo: staffId,
        status: cfg.status,
        channel: cfg.channel,
        subtotalKobo,
        discountKobo: 0,
        taxKobo: totalTaxKobo,
        totalKobo,
        paymentStatus: cfg.withPayment ? 'paid' : 'pending',
        ...(cfg.status === 'fulfilled' && { fulfilledAt: daysAgo(cfg.daysAgoCreated - 1) }),
        ...(cfg.status === 'cancelled' && { cancelledAt: daysAgo(cfg.daysAgoCreated - 1) }),
        createdAt,
        updatedAt: createdAt,
      });

      await db.insert(orderItems).values(
        itemInputs.map((item) => ({
          id: uuidv4(),
          orderId,
          variantId: item.variantId,
          quantity: item.quantity,
          unitPriceKobo: item.unitPriceKobo,
          discountKobo: item.discountKobo,
          taxKobo: item.taxKobo,
          lineTotalKobo: item.lineTotalKobo,
          createdAt,
        })),
      );

      // For paid orders, insert payment + balanced journal entries
      if (cfg.withPayment && cfg.status !== 'cancelled') {
        const paymentId = uuidv4();
        const feeKobo = Math.floor(totalKobo * 0.015); // ~1.5% Paystack fee

        await db.insert(payments).values({
          id: paymentId,
          orderId,
          gateway: 'paystack',
          gatewayReference: `PS-${paymentId.slice(0, 8)}`,
          gatewayEventId: `EVT-${paymentId.slice(0, 8)}`,
          amountKobo: totalKobo,
          feeKobo,
          status: 'paid',
          paidAt: createdAt,
          createdAt,
          updatedAt: createdAt,
        });

        // Journal entries: order paid (DR Cash / CR Revenue)
        const entryId = uuidv4();
        await db.insert(journalEntries).values({
          id: entryId,
          referenceId: paymentId,
          referenceType: 'order_payment',
          description: `Payment received for order ${orderNum}`,
          postedAt: createdAt,
          createdBy: 'system',
        });
        await db.insert(journalLines).values([
          { id: uuidv4(), journalEntryId: entryId, accountId: cashAccountId,    type: 'debit',  amountKobo: totalKobo, createdAt },
          { id: uuidv4(), journalEntryId: entryId, accountId: revenueAccountId, type: 'credit', amountKobo: totalKobo, createdAt },
        ]);

        // Fee entry (DR Fees / CR Cash)
        if (feeKobo > 0) {
          const feeEntryId = uuidv4();
          await db.insert(journalEntries).values({
            id: feeEntryId,
            referenceId: paymentId,
            referenceType: 'payment_fee',
            description: `Paystack fee for order ${orderNum}`,
            postedAt: createdAt,
            createdBy: 'system',
          });
          await db.insert(journalLines).values([
            { id: uuidv4(), journalEntryId: feeEntryId, accountId: feesAccountId, type: 'debit',  amountKobo: feeKobo, createdAt },
            { id: uuidv4(), journalEntryId: feeEntryId, accountId: cashAccountId, type: 'credit', amountKobo: feeKobo, createdAt },
          ]);
        }
      }
    }

    console.log(`  ↳ Orders seeded: ${orderCount}`);

    // ── Expenses ────────────────────────────────────────────────────────────
    const [existingExpense] = await db.select({ id: expenses.id }).from(expenses).limit(1);
    if (!existingExpense) {
      const expenseData = [
        { description: 'Monthly rent — Lagos Island store', amountNaira: 350000, category: 'rent', daysAgo: 30 },
        { description: 'PHCN electricity bill', amountNaira: 45000, category: 'utilities', daysAgo: 25 },
        { description: 'Staff salaries — January', amountNaira: 480000, category: 'salaries', daysAgo: 20 },
        { description: 'Google Ads — product campaign', amountNaira: 85000, category: 'marketing', daysAgo: 15 },
        { description: 'Packing materials and boxes', amountNaira: 28000, category: 'supplies', daysAgo: 10 },
        { description: 'Dispatch rider fees', amountNaira: 18000, category: 'transport', daysAgo: 7 },
        { description: 'Monthly rent — Ikeja branch', amountNaira: 220000, category: 'rent', daysAgo: 3 },
      ];

      for (const e of expenseData) {
        const expenseId = uuidv4();
        const expenseDate = daysAgo(e.daysAgo);
        const amountKobo = kobo(e.amountNaira);

        await db.insert(expenses).values({
          id: expenseId,
          description: e.description,
          amountKobo,
          category: e.category,
          locationId: mainLocationId,
          expenseDate,
          createdBy: ownerId,
          createdAt: expenseDate,
        });

        // Journal entry: DR OpEx / CR Cash
        const entryId = uuidv4();
        await db.insert(journalEntries).values({
          id: entryId,
          referenceId: expenseId,
          referenceType: 'expense',
          description: e.description,
          postedAt: expenseDate,
          createdBy: ownerId,
        });
        await db.insert(journalLines).values([
          { id: uuidv4(), journalEntryId: entryId, accountId: opexAccountId,  type: 'debit',  amountKobo, createdAt: expenseDate },
          { id: uuidv4(), journalEntryId: entryId, accountId: cashAccountId,  type: 'credit', amountKobo, createdAt: expenseDate },
        ]);
      }

      console.log(`  ↳ Expenses seeded: ${expenseData.length}`);
    }
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌱 BPOS QA Seed — starting\n');

  await seedTenant(TENANTS[0]!, ELECTRONICS_CATALOGUE);
  await seedTenant(TENANTS[1]!, FASHION_CATALOGUE);

  console.log('\n✅ QA seed complete\n');
  console.log('  Tenant 1 — Kemi\'s Electronics');
  console.log(`    Email: ${TENANTS[0]!.businessEmail}`);
  console.log(`    Password: ${TENANTS[0]!.ownerPassword}`);
  console.log('  Tenant 2 — Lagos Fashion House');
  console.log(`    Email: ${TENANTS[1]!.businessEmail}`);
  console.log(`    Password: ${TENANTS[1]!.ownerPassword}`);

  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
