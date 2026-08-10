/**
 * Tenant schema template.
 * Every table defined here is created in each tenant's isolated PostgreSQL schema.
 * Drizzle migrations for this schema are applied to each tenant on provisioning
 * and on platform-wide schema migrations.
 */
import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  pgEnum,
  uniqueIndex,
  index,
  numeric,
  jsonb,
  real,
} from 'drizzle-orm/pg-core';

// ─── Enums ───────────────────────────────────────────────────────────────────

export const userRoleEnum = pgEnum('user_role', ['owner', 'manager', 'staff', 'viewer']);

export const orderStatusEnum = pgEnum('order_status', [
  'draft',
  'confirmed',
  'processing',
  'fulfilled',
  'dispatched',
  'cancelled',
  'refunded',
]);

export const paymentStatusEnum = pgEnum('payment_status', [
  'pending',
  'initiated',
  'paid',
  'failed',
  'refunded',
  'partially_refunded',
]);

export const paymentGatewayEnum = pgEnum('payment_gateway', ['paystack', 'flutterwave', 'manual']);

export const stockMovementTypeEnum = pgEnum('stock_movement_type', [
  'receive',
  'sale',
  'adjustment',
  'return',
  'transfer',
]);

export const ledgerEntryTypeEnum = pgEnum('ledger_entry_type', ['debit', 'credit']);

export const dispatchStatusEnum = pgEnum('dispatch_status', [
  'pending',
  'dispatched',
  'in_transit',
  'delivered',
  'failed',
  'returned',
]);

// ─── Staff / Users ────────────────────────────────────────────────────────────

export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(), // PII: hashed, never stored plain
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    phone: text('phone'), // PII
    role: userRoleEnum('role').notNull().default('staff'),
    locationId: text('location_id'),
    isActive: boolean('is_active').notNull().default(true),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    emailIdx: uniqueIndex('users_email_idx').on(table.email),
    roleIdx: index('users_role_idx').on(table.role),
  }),
);

// ─── Locations ────────────────────────────────────────────────────────────────

export const locations = pgTable('locations', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  address: text('address'),
  phone: text('phone'),
  isDefault: boolean('is_default').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Products ─────────────────────────────────────────────────────────────────

export const categories = pgTable('categories', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  parentId: text('parent_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const products = pgTable(
  'products',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description'),
    categoryId: text('category_id').references(() => categories.id),
    imageUrl: text('image_url'),
    isActive: boolean('is_active').notNull().default(true),
    hasVariants: boolean('has_variants').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    categoryIdx: index('products_category_idx').on(table.categoryId),
    activeIdx: index('products_active_idx').on(table.isActive),
  }),
);

export const productVariants = pgTable(
  'product_variants',
  {
    id: text('id').primaryKey(),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    sku: text('sku').notNull(),
    name: text('name').notNull(),
    // All monetary values stored in kobo (smallest NGN unit = 1/100 of a naira)
    priceKobo: integer('price_kobo').notNull(),
    costKobo: integer('cost_kobo').notNull().default(0),
    // Tax rate in basis points (10000 = 100%). Nigeria standard VAT = 750 (7.5%).
    // null = no tax / inherit from business default. Only visible to manager+.
    taxRateBps: integer('tax_rate_bps'),
    attributes: text('attributes'), // JSON string: { color: 'red', size: 'M' }
    weightKg: real('weight_kg'), // optional — required for weight-based shipping rates
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    skuIdx: uniqueIndex('product_variants_sku_idx').on(table.sku),
    productIdx: index('product_variants_product_idx').on(table.productId),
  }),
);

// ─── Inventory ────────────────────────────────────────────────────────────────

export const inventory = pgTable(
  'inventory',
  {
    id: text('id').primaryKey(),
    variantId: text('variant_id')
      .notNull()
      .references(() => productVariants.id, { onDelete: 'cascade' }),
    locationId: text('location_id')
      .notNull()
      .references(() => locations.id),
    quantityOnHand: integer('quantity_on_hand').notNull().default(0),
    lowStockThreshold: integer('low_stock_threshold').notNull().default(5),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    variantLocationIdx: uniqueIndex('inventory_variant_location_idx').on(
      table.variantId,
      table.locationId,
    ),
  }),
);

export const stockMovements = pgTable(
  'stock_movements',
  {
    id: text('id').primaryKey(),
    variantId: text('variant_id')
      .notNull()
      .references(() => productVariants.id),
    locationId: text('location_id').notNull().references(() => locations.id),
    type: stockMovementTypeEnum('type').notNull(),
    quantity: integer('quantity').notNull(),
    referenceId: text('reference_id'), // orderId, purchaseOrderId, etc.
    referenceType: text('reference_type'), // 'order', 'purchase_order', 'adjustment'
    note: text('note'),
    createdBy: text('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    variantIdx: index('stock_movements_variant_idx').on(table.variantId),
    referenceIdx: index('stock_movements_reference_idx').on(table.referenceId),
    createdAtIdx: index('stock_movements_created_at_idx').on(table.createdAt),
  }),
);

// ─── Customers ────────────────────────────────────────────────────────────────

export const customers = pgTable(
  'customers',
  {
    id: text('id').primaryKey(),
    firstName: text('first_name').notNull(), // PII
    lastName: text('last_name'), // PII
    email: text('email'), // PII
    phone: text('phone'), // PII
    address: text('address'), // PII
    note: text('note'),
    // NDPR compliance: record when and how the customer consented to data collection
    consentGivenAt: timestamp('consent_given_at', { withTimezone: true }),
    consentSource: text('consent_source'), // 'pos_signup' | 'whatsapp_chat' | 'web_checkout' | 'manual'
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    emailIdx: index('customers_email_idx').on(table.email),
    phoneIdx: index('customers_phone_idx').on(table.phone),
  }),
);

// ─── Orders ───────────────────────────────────────────────────────────────────

export const orders = pgTable(
  'orders',
  {
    id: text('id').primaryKey(),
    orderNumber: text('order_number').notNull(),
    customerId: text('customer_id').references(() => customers.id),
    locationId: text('location_id').references(() => locations.id),
    assignedTo: text('assigned_to').references(() => users.id),
    status: orderStatusEnum('status').notNull().default('draft'),
    channel: text('channel').notNull().default('manual'), // 'website' | 'pos' | 'whatsapp' | 'manual'
    subtotalKobo: integer('subtotal_kobo').notNull().default(0),
    discountKobo: integer('discount_kobo').notNull().default(0),
    taxKobo: integer('tax_kobo').notNull().default(0),
    totalKobo: integer('total_kobo').notNull().default(0),
    note: text('note'),
    paymentStatus: paymentStatusEnum('payment_status').notNull().default('pending'),
    fulfilledAt: timestamp('fulfilled_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    // Shipping
    shippingMethodId: text('shipping_method_id'), // FK resolved at app layer (circular ref avoidance)
    pickupLocationId: text('pickup_location_id'), // FK resolved at app layer
    destinationState: text('destination_state'), // Nigerian state name — used for zone-based rate lookup
    // When a free-shipping method is used, deliveryFeeKobo = 0 (customer pays nothing).
    // merchantShippingCostKobo records what the merchant actually pays the courier.
    // This is sourced from shippingMethods.merchantCostKobo at order creation time.
    merchantShippingCostKobo: integer('merchant_shipping_cost_kobo').notNull().default(0),
    // Logistics / dispatch fields
    deliveryAddress: text('delivery_address'),
    deliveryFeeKobo: integer('delivery_fee_kobo').notNull().default(0),
    logisticsProvider: text('logistics_provider'),
    logisticsReference: text('logistics_reference'),
    trackingNumber: text('tracking_number'),
    estimatedDeliveryAt: timestamp('estimated_delivery_at', { withTimezone: true }),
    dispatchedAt: timestamp('dispatched_at', { withTimezone: true }),
    dispatchStatus: dispatchStatusEnum('dispatch_status').default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orderNumberIdx: uniqueIndex('orders_order_number_idx').on(table.orderNumber),
    statusIdx: index('orders_status_idx').on(table.status),
    customerIdx: index('orders_customer_idx').on(table.customerId),
    createdAtIdx: index('orders_created_at_idx').on(table.createdAt),
    channelIdx: index('orders_channel_idx').on(table.channel),
  }),
);

export const orderItems = pgTable(
  'order_items',
  {
    id: text('id').primaryKey(),
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    variantId: text('variant_id')
      .notNull()
      .references(() => productVariants.id),
    quantity: integer('quantity').notNull(),
    unitPriceKobo: integer('unit_price_kobo').notNull(),
    discountKobo: integer('discount_kobo').notNull().default(0),
    taxKobo: integer('tax_kobo').notNull().default(0),
    lineTotalKobo: integer('line_total_kobo').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orderIdx: index('order_items_order_idx').on(table.orderId),
  }),
);

// ─── Payments ─────────────────────────────────────────────────────────────────

export const payments = pgTable(
  'payments',
  {
    id: text('id').primaryKey(),
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id),
    gateway: paymentGatewayEnum('gateway').notNull(),
    gatewayReference: text('gateway_reference'), // Paystack ref / Flutterwave txRef
    gatewayEventId: text('gateway_event_id'), // Webhook event ID for idempotency
    amountKobo: integer('amount_kobo').notNull(),
    feeKobo: integer('fee_kobo').notNull().default(0),
    currency: text('currency').notNull().default('NGN'),
    status: paymentStatusEnum('status').notNull().default('pending'),
    metadata: text('metadata'), // JSON: raw gateway response
    paidAt: timestamp('paid_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orderIdx: index('payments_order_idx').on(table.orderId),
    eventIdIdx: uniqueIndex('payments_event_id_idx').on(table.gatewayEventId),
    gatewayRefIdx: index('payments_gateway_ref_idx').on(table.gatewayReference),
  }),
);

// ─── Ledger ───────────────────────────────────────────────────────────────────

export const ledgerAccounts = pgTable(
  'ledger_accounts',
  {
    id: text('id').primaryKey(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    type: text('type').notNull(), // 'asset' | 'liability' | 'equity' | 'revenue' | 'expense'
    isSystem: boolean('is_system').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    codeIdx: uniqueIndex('ledger_accounts_code_idx').on(table.code),
  }),
);

export const journalEntries = pgTable(
  'journal_entries',
  {
    id: text('id').primaryKey(),
    referenceId: text('reference_id').notNull(), // paymentId, expenseId, etc.
    referenceType: text('reference_type').notNull(), // 'order_payment' | 'refund' | 'expense' | 'fee'
    description: text('description').notNull(),
    postedAt: timestamp('posted_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by'), // userId or 'system'
  },
  (table) => ({
    referenceIdx: index('journal_entries_reference_idx').on(table.referenceId),
    postedAtIdx: index('journal_entries_posted_at_idx').on(table.postedAt),
  }),
);

export const journalLines = pgTable(
  'journal_lines',
  {
    id: text('id').primaryKey(),
    journalEntryId: text('journal_entry_id')
      .notNull()
      .references(() => journalEntries.id, { onDelete: 'cascade' }),
    accountId: text('account_id')
      .notNull()
      .references(() => ledgerAccounts.id),
    type: ledgerEntryTypeEnum('type').notNull(),
    // Stored in kobo (integer) to avoid floating-point arithmetic errors
    amountKobo: integer('amount_kobo').notNull(),
    currency: text('currency').notNull().default('NGN'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    journalIdx: index('journal_lines_journal_idx').on(table.journalEntryId),
    accountIdx: index('journal_lines_account_idx').on(table.accountId),
  }),
);

// ─── Subscriptions ────────────────────────────────────────────────────────────

export const subscriptions = pgTable('subscriptions', {
  id: text('id').primaryKey(),
  planTier: text('plan_tier').notNull().default('trial'),
  status: text('status').notNull().default('trial'), // mirrors subscriptionStatusEnum values
  currentPeriodStart: timestamp('current_period_start', { withTimezone: true }),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
  trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  paystackSubscriptionCode: text('paystack_subscription_code'),
  // Card authorization code saved from first payment — used for recurring billing
  paystackAuthorizationCode: text('paystack_authorization_code'),
  paystackCustomerCode: text('paystack_customer_code'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Expenses ─────────────────────────────────────────────────────────────────

export const expenses = pgTable(
  'expenses',
  {
    id: text('id').primaryKey(),
    description: text('description').notNull(),
    amountKobo: integer('amount_kobo').notNull(),
    category: text('category').notNull(),
    locationId: text('location_id').references(() => locations.id),
    receiptUrl: text('receipt_url'),
    expenseDate: timestamp('expense_date', { withTimezone: true }).notNull(),
    createdBy: text('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    dateIdx: index('expenses_date_idx').on(table.expenseDate),
    categoryIdx: index('expenses_category_idx').on(table.category),
  }),
);

// ─── Invoices ─────────────────────────────────────────────────────────────────

export const invoices = pgTable(
  'invoices',
  {
    id: text('id').primaryKey(),
    orderId: text('order_id').references(() => orders.id),
    invoiceNumber: text('invoice_number').notNull(),
    pdfUrl: text('pdf_url'),
    status: text('status').notNull().default('draft'), // 'draft' | 'sent' | 'paid'
    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
    dueAt: timestamp('due_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    invoiceNumberIdx: uniqueIndex('invoices_number_idx').on(table.invoiceNumber),
  }),
);

// ─── Logistics Events ─────────────────────────────────────────────────────────

export const logisticsEvents = pgTable(
  'logistics_events',
  {
    id: text('id').primaryKey(),
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id),
    eventType: text('event_type').notNull(),
    eventData: jsonb('event_data'),
    eventId: text('event_id').notNull(), // provider idempotency key
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orderIdx: index('logistics_events_order_idx').on(table.orderId),
    eventIdIdx: uniqueIndex('logistics_events_event_id_idx').on(table.eventId),
  }),
);

// ─── Shipping ─────────────────────────────────────────────────────────────────

export const shippingMethodTypeEnum = pgEnum('shipping_method_type', [
  'flat_rate',
  'zone_rate',
  'value_rate',
  'weight_rate',
  'automated',
  'free',
  'pick_up',
]);

export const freeShippingConditionTypeEnum = pgEnum('free_shipping_condition_type', [
  'always',
  'min_order_value',
  'product',
  'category',
  'promo_code',
]);

export const pickupLocationTypeEnum = pgEnum('pickup_location_type', [
  'merchant_branch',
  'third_party',
]);

// Merchant-defined zones: a named group of Nigerian states.
// e.g. { name: 'Lagos', states: ['Lagos'] }
// e.g. { name: 'South West', states: ['Lagos', 'Ogun', 'Oyo', 'Osun', 'Ekiti', 'Ondo'] }
export const shippingZones = pgTable('shipping_zones', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  states: jsonb('states').notNull(), // string[] — list of Nigerian state names in this zone
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// A merchant-configured shipping option presented at checkout.
export const shippingMethods = pgTable(
  'shipping_methods',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(), // e.g. "Standard Delivery", "Express", "Pick Up"
    type: shippingMethodTypeEnum('type').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    description: text('description'),
    estimatedDaysMin: integer('estimated_days_min'), // e.g. 1 — for display only
    estimatedDaysMax: integer('estimated_days_max'), // e.g. 3
    // flat_rate only: static fee charged to the customer
    flatRateKobo: integer('flat_rate_kobo'),
    // free method: isFreeAlways = true means customer is charged ₦0.
    // The merchant still pays the courier — that cost is tracked via merchantCostKobo.
    isFreeAlways: boolean('is_free_always').notNull().default(false),
    // The merchant's actual cost per delivery when offering free shipping to customers.
    // Populated from this field onto orders.merchantShippingCostKobo at order creation.
    // Used for cost analysis and expense reporting. Does not affect what the customer pays.
    merchantCostKobo: integer('merchant_cost_kobo'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    activeIdx: index('shipping_methods_active_idx').on(table.isActive),
    typeIdx: index('shipping_methods_type_idx').on(table.type),
  }),
);

// Rate rows for zone_rate, value_rate, and weight_rate methods.
// Each row belongs to one method and defines fee for a specific range/zone.
export const shippingRates = pgTable(
  'shipping_rates',
  {
    id: text('id').primaryKey(),
    methodId: text('method_id')
      .notNull()
      .references(() => shippingMethods.id, { onDelete: 'cascade' }),
    // For zone_rate: which zone this rate applies to.
    // null on a zone_rate method = fallback/catch-all rate for unmatched states.
    zoneId: text('zone_id').references(() => shippingZones.id, { onDelete: 'set null' }),
    // For value_rate: order value range (kobo). null max = no upper bound.
    minOrderValueKobo: integer('min_order_value_kobo'),
    maxOrderValueKobo: integer('max_order_value_kobo'),
    // For weight_rate: weight range (kg). null max = no upper bound.
    minWeightKg: real('min_weight_kg'),
    maxWeightKg: real('max_weight_kg'),
    feeKobo: integer('fee_kobo').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    methodIdx: index('shipping_rates_method_idx').on(table.methodId),
  }),
);

// Conditions that make a 'free' shipping method available.
// A free method with no rows and isFreeAlways=false will never appear at checkout.
export const freeShippingConditions = pgTable(
  'free_shipping_conditions',
  {
    id: text('id').primaryKey(),
    methodId: text('method_id')
      .notNull()
      .references(() => shippingMethods.id, { onDelete: 'cascade' }),
    conditionType: freeShippingConditionTypeEnum('condition_type').notNull(),
    thresholdKobo: integer('threshold_kobo'), // for min_order_value
    productId: text('product_id'), // for product type
    categoryId: text('category_id'), // for category type
    promoCode: text('promo_code'), // for promo_code type
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    methodIdx: index('free_shipping_conditions_method_idx').on(table.methodId),
    promoCodeIdx: index('free_shipping_conditions_promo_idx').on(table.promoCode),
  }),
);

// Unified pick-up locations: merchant's own branches OR third-party collection points.
export const pickupLocations = pgTable(
  'pickup_locations',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    locationType: pickupLocationTypeEnum('location_type').notNull(),
    // merchant_branch — references the existing locations table
    locationId: text('location_id'), // FK to locations.id, set when locationType='merchant_branch'
    // third_party — logistics provider's collection point
    providerName: text('provider_name'), // 'gig' | 'dhl' | 'kwik' | etc.
    address: text('address').notNull(),
    state: text('state'), // Nigerian state for filtering / display
    phone: text('phone'),
    operatingHours: text('operating_hours'), // free-text e.g. "Mon–Fri 9am–5pm"
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    activeIdx: index('pickup_locations_active_idx').on(table.isActive),
    typeIdx: index('pickup_locations_type_idx').on(table.locationType),
    stateIdx: index('pickup_locations_state_idx').on(table.state),
  }),
);

// ─── Infer types ──────────────────────────────────────────────────────────────

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Location = typeof locations.$inferSelect;
export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type ProductVariant = typeof productVariants.$inferSelect;
export type NewProductVariant = typeof productVariants.$inferInsert;
export type Inventory = typeof inventory.$inferSelect;
export type StockMovement = typeof stockMovements.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;
export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
export type OrderItem = typeof orderItems.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type LedgerAccount = typeof ledgerAccounts.$inferSelect;
export type JournalEntry = typeof journalEntries.$inferSelect;
export type JournalLine = typeof journalLines.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type Expense = typeof expenses.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type LogisticsEvent = typeof logisticsEvents.$inferSelect;
export type ShippingZone = typeof shippingZones.$inferSelect;
export type ShippingMethod = typeof shippingMethods.$inferSelect;
export type ShippingRate = typeof shippingRates.$inferSelect;
export type FreeShippingCondition = typeof freeShippingConditions.$inferSelect;
export type PickupLocation = typeof pickupLocations.$inferSelect;
