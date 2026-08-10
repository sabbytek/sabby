# Product Requirements Document
## [Platform Name] — Multi-Tenant Commerce & Operations Platform for Nigerian SMEs

**Version:** 1.0  
**Status:** Active Development  
**Date:** July 2026  
**Product Owner:** Stephen Oyeyemi  
**Engagement Type:** Equity-based side contract  
**Target Market:** Nigerian SME merchants (Bumpa alternative)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Goals & Success Metrics](#3-goals--success-metrics)
4. [User Personas](#4-user-personas)
5. [Product Architecture Overview](#5-product-architecture-overview)
6. [Feature Requirements & User Stories](#6-feature-requirements--user-stories)
   - 6.1 Merchant Onboarding & Multi-Tenancy
   - 6.2 Product Catalogue & Inventory
   - 6.3 Order Management
   - 6.4 Payments & Ledger
   - 6.5 Point of Sale (POS)
   - 6.6 WhatsApp Commerce Channel
   - 6.7 Customer Storefront (Web)
   - 6.8 Reporting & Financial Intelligence
   - 6.9 Expenses & Invoicing
   - 6.10 Staff & Multi-Location Management
   - 6.11 Subscription Billing & Feature Gating
   - 6.12 Logistics & Dispatch
   - 6.13 Platform Observability & Alerting
7. [Non-Functional Requirements](#7-non-functional-requirements)
8. [Out of Scope (Phase 2 / 3)](#8-out-of-scope-phase-2--3)
9. [Risk Register](#9-risk-register)
10. [Build Status & TODO Checklist](#10-build-status--todo-checklist)

---

## 1. Executive Summary

[Platform Name] is a multi-tenant commerce and business operations platform purpose-built for Nigerian small-to-medium enterprises. It gives a merchant a unified system for running their product catalogue, taking orders across multiple channels (website, physical POS, and WhatsApp), processing Nigerian payments, and making sense of their finances — all from a single platform.

The project is positioned as a direct alternative to Bumpa, differentiated by deeper financial intelligence (double-entry ledger, real P&L), a native WhatsApp commerce channel, and a multi-location / multi-staff architecture that grows with the merchant.

The backend API is being built by a single engineer (20 hrs/week), with web and mobile frontend contracted out. Phase 1 targets onboarding one real paying merchant within 6–8 weeks of contract sign.

---

## 2. Problem Statement

Nigerian SMEs selling online face a fragmented tool stack. They use separate tools for inventory, a different one for payments, WhatsApp manually for orders, a spreadsheet for accounting, and a third-party POS at the physical counter. The result is:

- Orders fall through the cracks across channels.
- Stock counts are perpetually wrong.
- There is no trusted single source of financial truth — no real P&L.
- Scaling from one location to two breaks every tool they have.
- WhatsApp, their highest-engagement channel, is handled entirely by human effort.

Existing platforms like Bumpa partially address this but lack double-entry bookkeeping, reliable multi-location inventory, or a WhatsApp-native ordering flow.

**[Platform Name] solves this** by providing a single API-backed platform that unifies all sales channels, maintains rigorous financial records through a double-entry ledger, and automates the WhatsApp ordering workflow that Nigerian merchants already rely on.

---

## 3. Goals & Success Metrics

### Phase 1 Launch Goals

| Goal | Metric | Target |
|------|--------|--------|
| Merchant acquisition | Paying merchants on production | ≥ 1 by end of Week 8 |
| Payments live | Real transactions processed | > ₦0 through Paystack or Flutterwave |
| Order coverage | Channels active | Website + POS + WhatsApp (or 2 of 3 if WhatsApp approval delayed) |
| Financial accuracy | Ledger balance check | Every journal entry balanced (debit = credit) on every transaction |
| Subscription billing | Recurring revenue | Subscription auto-renews without manual intervention |
| Platform stability | Error rate | < 1% 5xx responses under normal load |

### Phase 2+ Growth Goals (not in scope for v1)

- 50+ active merchants within 6 months of Phase 1 launch
- WhatsApp conversation-to-order conversion rate ≥ 30%
- Merchant churn rate < 10%/month (indicating genuine utility)

---

## 4. User Personas

### Persona 1 — Adaeze, the Merchant Owner

> "I run three shops selling beauty products in Lagos. I need to know what's selling, what's in stock, and whether I'm actually making money — without hiring an accountant."

- **Role:** Business owner, platform super-user
- **Goals:** Full visibility into revenue, profit, and inventory across all locations
- **Pain points:** Stock discrepancies between branches, no single P&L view, manually handling WhatsApp orders
- **Accesses:** Merchant Dashboard (web), reporting, staff management, subscription

**Key user stories for Adaeze:**

> *As a merchant owner, I want to see a real-time P&L across all my locations so that I can understand whether my business is profitable without waiting for month-end.*

> *As a merchant owner, I want to invite staff to manage specific locations and restrict their access to financial data so that I can delegate operations without losing control.*

> *As a merchant owner, I want to receive a low-stock alert when any product falls below my threshold so that I never turn away a customer due to stockout.*

---

### Persona 2 — Chike, the Shop Manager

> "I manage one of Adaeze's branches. I need to add products, process sales, and handle returns without having to call the owner every time."

- **Role:** Day-to-day operations, store-level manager
- **Goals:** Process orders quickly, manage inventory, view location-specific sales
- **Pain points:** Slow checkout at POS, unclear return procedures, no visibility into inventory from warehouse
- **Accesses:** POS, order management, inventory (location-scoped), customer records

**Key user stories for Chike:**

> *As a shop manager, I want to process an in-person sale from product scan to payment receipt in under 60 seconds so that customers are not kept waiting.*

> *As a shop manager, I want to process a return and have the inventory automatically restocked so that I don't have to do a manual adjustment afterward.*

> *As a shop manager, I want to add a customer's details at POS so that the owner can see purchase history per customer.*

---

### Persona 3 — Ngozi, the End Customer

> "I saw Adaeze's products on Instagram. I'd rather just order on WhatsApp than figure out a new website."

- **Role:** Buyer via web storefront or WhatsApp
- **Goals:** Browse products, place an order, pay easily, know when it will arrive
- **Pain points:** Unfamiliar checkout flows, trust issues with small business websites, Interswitch redirects that look sketchy

**Key user stories for Ngozi:**

> *As a customer, I want to browse products and add them to a cart directly inside WhatsApp so that I can order without leaving my most-used app.*

> *As a customer, I want to receive an order confirmation and tracking update via WhatsApp so that I know my order is confirmed and on its way.*

> *As a customer, I want to pay for my online order using a bank transfer (USSD or direct) so that I am not asked for card details I don't trust on an unfamiliar site.*

---

### Persona 4 — The Platform Admin (Internal)

> "I need to monitor tenant provisioning, spot errors on production, and respond before a merchant calls us."

- **Role:** Platform operations
- **Goals:** Proactive error detection, tenant health, subscription status
- **Pain points:** Silent failures in payment webhooks, tenant provisioning errors going unnoticed

**Key user stories for Platform Admin:**

> *As a platform admin, I want to receive a Slack alert when a 5xx error occurs in production so that I can investigate before the merchant reports it.*

> *As a platform admin, I want to provision a new merchant tenant via a single API call so that onboarding is repeatable and error-free.*

---

## 5. Product Architecture Overview

| Layer | Technology |
|-------|-----------|
| Runtime & Framework | Node.js + TypeScript, Fastify |
| Database | PostgreSQL (Neon) — schema-per-tenant isolation via Drizzle ORM |
| Cache & Job Queue | Upstash Redis + BullMQ (6 background workers) |
| File Storage | Cloudflare R2 (images with server-side compression) |
| Payments | Paystack (primary) + Flutterwave (secondary) — gateway abstraction layer |
| SMS Notifications | Termii |
| Messaging | WhatsApp Business API (Meta) |
| Deployment | Docker + Fly.io (fly.toml configured) |
| Observability | Fastify metrics plugin, structured error logging, Slack alerting |
| Security | Helmet headers, CORS, per-route rate limiting, JWT (access + refresh), bcrypt, HMAC webhook signature verification |
| Design System | Inter font, Indigo (#4F46E5) accent, Apple-inspired minimal aesthetic |

**Multi-tenancy model:** Each merchant is a tenant with a fully isolated PostgreSQL schema. A middleware layer resolves the tenant from the incoming request and switches the DB connection to the correct schema before any route handler runs.

**Background workers:** Six BullMQ workers handle async processing: `payments`, `notifications`, `documents`, `inventory`, `logistics`, and `subscriptions`.

**API surface:** All routes documented via Swagger (enabled in dev/staging). API-first contract is the single handoff point to contracted frontend teams.

---

## 6. Feature Requirements & User Stories

### 6.1 Merchant Onboarding & Multi-Tenancy

The platform provisions an isolated database schema and default configuration for each new merchant.

**User stories:**

> *As a merchant signing up for the first time, I want a guided onboarding flow that captures my business name, location, and initial product so that I can go from signup to first sale in one session.*

> *As the platform, I need tenant provisioning to run Drizzle migrations on the new schema and seed default ledger accounts so that a new tenant is immediately operational.*

> *As a merchant, I want a free trial period before I am asked to subscribe so that I can experience the platform's value before committing.*

**Acceptance criteria:**
- `POST /onboarding` creates a tenant record in the public schema and provisions the tenant schema end-to-end
- Default ledger accounts (asset, liability, equity, revenue, expense) are seeded on provision
- Trial status is set automatically; trial end date is configurable per plan

---

### 6.2 Product Catalogue & Inventory

Merchants manage a hierarchical product catalogue with variants, track stock per location, and receive alerts on low stock.

**User stories:**

> *As a merchant owner, I want to create a product with multiple variants (e.g., size and color) and set a different price and cost for each variant so that my catalogue reflects real-world SKU complexity.*

> *As a merchant owner, I want to upload a product image and have it compressed and stored automatically so that my storefront looks good without me managing file sizes.*

> *As a shop manager, I want to see the current stock level for a product at my location so that I know what I can sell right now.*

> *As a merchant, I want to record a stock adjustment with a reason note so that my inventory ledger has an audit trail for shrinkage and corrections.*

> *As a merchant, I want to receive an automatic notification when a product variant falls below its low-stock threshold so that I can reorder before running out.*

**Acceptance criteria:**
- Product variants carry SKU, price (kobo), cost (kobo), tax rate (basis points), and variant attributes (JSON)
- Inventory record is per variant + location; `quantity_on_hand` is updated on every sale and adjustment
- Every stock change writes a `stock_movements` row with `type`, `quantity`, `reference_id`, and `created_by`
- Low-stock check fires asynchronously via the `inventory` BullMQ worker

---

### 6.3 Order Management

All orders — regardless of channel — flow through a single pipeline with a shared state machine.

**Order lifecycle:** `draft → confirmed → processing → fulfilled → dispatched → cancelled / refunded`

**User stories:**

> *As a shop manager, I want to create a manual order for a walk-in customer and add line items by searching products so that I have a record of every sale regardless of channel.*

> *As a merchant, I want order status to progress automatically when a payment is confirmed so that I don't have to manually update status after each webhook fires.*

> *As a merchant, I want to cancel an order and have inventory automatically restocked so that stock counts stay accurate.*

> *As a merchant, I want to see all orders across channels (website, POS, WhatsApp, manual) in a single unified list so that I have one place to manage fulfillment.*

**Acceptance criteria:**
- `channel` field on every order captures its origin: `website | pos | whatsapp | manual`
- State transitions are enforced by a state machine; invalid transitions return a 422
- Order totals are calculated server-side (subtotal, discount, tax in basis points, delivery fee) — never trusted from client
- Payment status is a separate field from order status, updated independently by webhook events

---

### 6.4 Payments & Ledger

Every financial transaction is captured through a payment gateway and posted to a double-entry ledger.

**User stories:**

> *As a customer, I want to pay for my order using a card, bank transfer, or USSD so that I can choose the method that works for me.*

> *As a merchant owner, I want every payment to automatically post balanced journal entries to the ledger so that my accounts are always up to date without manual bookkeeping.*

> *As the platform, I need payment webhooks to be idempotent so that retried webhook events never create duplicate ledger entries.*

> *As a merchant, I want to process a refund and have it post a reversing journal entry automatically so that my ledger stays accurate.*

**Acceptance criteria:**
- Gateway abstraction layer supports both Paystack and Flutterwave; `DEFAULT_PAYMENT_GATEWAY` env var switches the active gateway
- Webhook handlers verify HMAC signatures before processing
- Every webhook event is stored with `gateway_event_id` as a unique index — duplicate events are silently no-oped
- Journal entries always balance: sum of debits equals sum of credits; an unbalanced entry throws and rolls back
- All monetary values stored as integers (kobo) — no floating-point arithmetic anywhere in the financial path

---

### 6.5 Point of Sale (POS)

The POS is a dedicated, distraction-free interface for in-person sales — web and mobile.

**User stories:**

> *As a cashier, I want the POS to open in a full-screen mode without the dashboard sidebar so that I am not distracted by reports and settings during a busy checkout.*

> *As a cashier, I want to search for a product by name or scan a barcode and add it to the current order in one tap so that I can serve customers quickly.*

> *As a cashier, I want to apply a manual discount to a line item or the whole order so that I can honor verbal agreements the owner makes with regulars.*

> *As a cashier, I want to split payment between cash and transfer so that I can handle partial payments without creating a separate order.*

> *As a merchant owner, I want each POS transaction to be attributed to the cashier who processed it so that I can track individual staff sales performance.*

**Acceptance criteria:**
- POS route does not render the sidebar nav; exits via explicit "Exit POS" button
- Order channel is set to `pos` automatically
- `assigned_to` field on the order captures the logged-in staff member
- Payment method is recorded on the payment record (card, transfer, USSD, manual/cash)

---

### 6.6 WhatsApp Commerce Channel

Customers can browse, build a cart, and place a paid order entirely within a WhatsApp conversation.

**User stories:**

> *As a customer on WhatsApp, I want to type "Hi" or tap a greeting to start browsing a merchant's catalogue so that I don't need to remember any commands.*

> *As a customer, I want to add products to my WhatsApp cart and see a running total so that I know what I'm about to spend before confirming.*

> *As a customer, I want to receive a Paystack payment link inside the WhatsApp chat so that I can pay without leaving the conversation.*

> *As a merchant, I want incoming WhatsApp orders to appear in the same order pipeline as website and POS orders so that I manage fulfillment from one place.*

> *As the platform, I want WhatsApp sessions to expire after inactivity so that stale carts are cleaned up automatically.*

**Acceptance criteria:**
- WhatsApp webhook handler verifies the Meta signature before processing any event
- Session state is stored in Redis with a TTL; session state machine governs transitions: `idle → browsing → cart → checkout → awaiting_payment → complete`
- Completed WhatsApp orders are written with `channel = 'whatsapp'` to the standard orders table
- The integration is feature-gated: inactive if `WHATSAPP_ACCESS_TOKEN` is not configured

---

### 6.7 Customer Storefront (Web)

A public-facing product catalogue and checkout experience hosted on the merchant's domain.

**User stories:**

> *As a customer visiting the merchant's website, I want to browse products by category and see images, descriptions, and prices so that I can discover what's available.*

> *As a customer, I want to add products to a cart and check out with my delivery address so that I can receive my order at home.*

> *As a customer, I want to complete payment through Paystack's hosted checkout (card or bank transfer) so that I can trust the payment is secure.*

> *As a merchant, I want my storefront to automatically show "Out of Stock" for variants with zero inventory so that I don't receive orders I can't fulfill.*

**Acceptance criteria:**
- Storefront is read-only against the product catalogue; only active products and variants with `is_active = true` are returned
- Checkout flow creates an order with `channel = 'website'`, then initiates a payment and returns a Paystack/Flutterwave redirect URL
- NDPR-compliant: customer consent is recorded at the point of data collection (`consent_given_at`, `consent_source`)

---

### 6.8 Reporting & Financial Intelligence

Merchants access accurate, real-time financial and operations reports derived from the double-entry ledger.

**User stories:**

> *As a merchant owner, I want to view a Profit & Loss statement for any date range so that I can understand my business performance without an accountant.*

> *As a merchant owner, I want to see revenue broken down by location so that I know which branch is performing best.*

> *As a merchant owner, I want to see a staff sales report that shows each team member's total sales and number of transactions for any period so that I can identify high and low performers.*

> *As a merchant, I want to export report data so that I can share it with my accountant or investor.*

**Acceptance criteria:**
- P&L pulls revenue from `revenue` ledger accounts and expenses from `expense` ledger accounts — computed from journal lines, not from orders table
- Revenue-by-location query groups orders by `location_id` within the requested date range
- Staff sales report groups orders by `assigned_to` with sum of `total_kobo` and count of orders
- All monetary values in reports are returned in kobo with a naira-formatted display string

---

### 6.9 Expenses & Invoicing

Merchants record operating expenses and issue invoices to customers.

**User stories:**

> *As a merchant, I want to record an expense with a category, amount, and receipt photo so that I have documentation for every business cost.*

> *As a merchant, I want expense recording to automatically post a journal entry so that expenses reduce my profit on the P&L without any manual bookkeeping.*

> *As a merchant, I want to generate an invoice from a completed order and send it to the customer so that I have a formal record of the sale.*

> *As a merchant, I want to track whether an invoice has been paid or is still outstanding so that I can follow up on unpaid accounts.*

**Acceptance criteria:**
- Expense record requires: `description`, `amount_kobo`, `category`, `expense_date`; `receipt_url` (R2 link) is optional
- Expense creation triggers a debit to the appropriate expense account and a credit to the cash/bank account in the ledger
- Invoice status transitions: `draft → sent → paid`
- PDF generation endpoint returns a signed R2 URL for the invoice PDF

---

### 6.10 Staff & Multi-Location Management

Merchant owners invite staff members and assign them to locations with role-based access.

**Roles:** `owner → manager → staff → viewer`

**User stories:**

> *As a merchant owner, I want to invite a new staff member via email and assign them a role so that they can access only what they need.*

> *As a merchant owner, I want to assign a staff member to a specific location so that their sales reports and inventory views are scoped to that branch.*

> *As a staff member with a `viewer` role, I want to see sales summaries but not be able to create or modify orders so that I have read-only access appropriate to my role.*

> *As a merchant owner, I want to deactivate a staff account when someone leaves so that they immediately lose access without me deleting any historical data.*

**Acceptance criteria:**
- Role hierarchy: `owner > manager > staff > viewer` — enforced at middleware level, not in individual handlers
- `location_id` on the user record scopes their operational access; `null` = all locations (owner/manager)
- Deactivated users (`is_active = false`) are rejected at JWT validation, not merely hidden from UI
- `manager` can invite `staff` and `viewer`; only `owner` can invite `manager` or change roles

---

### 6.11 Subscription Billing & Feature Gating

The platform bills merchants monthly and gates features based on their active plan tier.

**Subscription lifecycle:** `trial → active → grace → lapsed`

**User stories:**

> *As a new merchant, I want to start on a free trial without entering a payment card so that I can try the platform before committing.*

> *As a merchant, I want to receive a reminder before my trial expires so that I have time to subscribe before losing access.*

> *As a merchant on a paid plan, I want my subscription to auto-renew monthly without me having to do anything so that my business is never interrupted.*

> *As a merchant whose payment fails, I want a grace period during which I retain access while I resolve the payment issue so that a single failed charge doesn't shut down my operations.*

> *As the platform, I want feature access to be governed by a configuration-driven gating engine so that I can change plan entitlements without deploying new code.*

**Acceptance criteria:**
- Subscription status is stored per tenant in the `subscriptions` table
- Feature gate middleware reads the tenant's current plan tier against a feature flag config and returns 402 if the feature is not included
- Grace period default: 3 days after billing failure before status moves to `lapsed`
- Paystack authorization code from first payment is stored and used for automated recurring charges
- Subscription state transitions are processed by the `subscriptions` BullMQ worker, not inline in request handlers

---

### 6.12 Logistics, Dispatch & Shipping Configuration

Merchants configure how they charge for delivery and dispatch physical orders through logistics provider integrations.

**User stories:**

> *As a merchant, I want to create a flat-rate shipping option (e.g. ₦1,500 for any delivery) so that I have a simple, predictable fee for all customers.*

> *As a merchant, I want to define shipping zones (e.g. "Lagos", "South West", "Rest of Nigeria") with different rates per zone so that my pricing reflects real logistics costs by geography.*

> *As a merchant, I want to set order-value tiers for shipping (e.g. free above ₦50,000; ₦2,000 for ₦10k–₦50k; ₦3,500 below ₦10k) so that I can incentivise larger orders.*

> *As a merchant, I want to create a free shipping option that activates only when the customer enters a promo code so that I can run delivery promotions.*

> *As a merchant, I want to offer pick-up from my own branches as well as third-party collection points (GIG, DHL) so that customers who prefer to collect can avoid delivery fees.*

> *As a customer at checkout, I want to see all available shipping methods with their prices and estimated delivery times so that I can make an informed choice.*

> *As a merchant, I want to get a live shipping quote from my logistics provider (TRAKA) before confirming dispatch so that the delivery fee reflects actual costs.*

> *As a merchant, I want to manually trigger dispatch after packaging the order so that I control when the shipment is booked.*

> *As a merchant, I want the order status to automatically update to "In Transit" when the logistics provider confirms pick-up so that my pipeline reflects real-world status.*

**Acceptance criteria:**
- Shipping method types: `flat_rate`, `zone_rate`, `value_rate`, `weight_rate`, `automated`, `free`, `pick_up`
- Shipping zones are merchant-defined groups of Nigerian states; a catch-all (no zone) rate serves as fallback
- Free shipping conditions: `always`, `min_order_value`, `product`, `category`, `promo_code`
- Pick-up locations model covers both merchant branches (`locations` table) and third-party collection points
- `GET /shipping/available` returns all applicable methods + fees for a given cart context, sorted cheapest first
- `deliveryFeeKobo` is included in order total calculation: `total = subtotal − discount + tax + deliveryFee`
- `shippingMethodId`, `pickupLocationId`, `destinationState` stored on orders
- Product variants have an optional `weightKg` field for weight-based shipping
- Logistics gateway abstraction supports TRAKA and a generic HTTP gateway
- Provider credentials are AES-256 encrypted; every webhook event is idempotent via `event_id`
- Dispatch is merchant-triggered (not automatic on payment); live quote is available before booking

---

### 6.13 Platform Observability & Alerting

The platform emits metrics, logs errors, and alerts the operations team via Slack.

**User stories:**

> *As a platform admin, I want to receive a Slack notification whenever a 5xx error occurs in production so that I can investigate before a merchant calls.*

> *As a platform admin, I want every API request to carry a unique `Request-ID` header so that I can trace a specific request through logs.*

> *As a platform admin, I want to see API metrics (request count, response time, error rate) so that I can detect degradation before it impacts merchants.*

**Acceptance criteria:**
- Global error handler catches all unhandled errors and posts to Slack (`SLACK_WEBHOOK_URL`) if configured
- `X-Request-ID` is generated and attached to every request; returned in the response header
- Metrics endpoint is available for scraping (Prometheus-compatible format)
- Rate limiting is configured per route with Fastify's rate-limit plugin

---

## 7. Non-Functional Requirements

| Category | Requirement |
|----------|-------------|
| Performance | API p95 response time < 300ms for read endpoints under normal load |
| Security | OWASP Top 10 compliance; all PII encrypted at rest; NDPR-compliant consent tracking |
| Reliability | Background jobs are idempotent and retryable; webhook deduplication via event ID |
| Scalability | Schema-per-tenant isolation enables horizontal tenant growth without shared-table contention |
| Availability | Deployment on Fly.io with health check endpoint; auto-restart on crash |
| Currency | All monetary values stored as integer kobo; no floating-point in financial calculations |
| Localisation | NGN-only at Phase 1; date/time stored with timezone; Lagos (Africa/Lagos) is default TZ |
| Compliance | NDPR: consent_given_at + consent_source recorded for all customer data; PII columns annotated in schema |

---

## 8. Out of Scope (Phase 2 / 3)

These are explicitly deferred. Building any of these in Phase 1 moves the launch date.

- **Virtual account issuance** — requires CBN-licensed banking partner
- **Float / wallet holding at scale** — requires PSSP licence
- **FIRS e-invoice / tax filing integration** — requires confirmed compliance pathway
- **Multi-currency settlement** — NGN only at launch; data model architected for future extension
- **Loyalty rewards, gift cards, advanced analytics** — Phase 3
- **Wholesale / B2B pricing tiers** — data model supports it; merchant-facing UI deferred
- **Native mobile apps** — Phase 2; Phase 1 is mobile-responsive web only

---

## 9. Risk Register

| Risk | Impact | Likelihood | Mitigation |
|------|--------|-----------|------------|
| WhatsApp Business API approval delayed | Core differentiator stalls | High | Submit Meta application immediately; build against sandbox stub so backend is ready the moment approval lands |
| Contract not signed before feature build | Work done for unsecured equity | Medium | Gate feature work behind signature; only foundation proceeds pre-signing |
| Contractor frontend slippage | Integration stage slips | Medium | API-first contract; Swagger docs as ground truth; milestone check-ins |
| Solo backend bandwidth (20 hrs/wk) | Stages run long | Medium-High | Hard scope hold per Section 8; no gold-plating; defer everything non-essential |
| Payment webhook silent failures | Merchant revenue not reconciled | Medium | Idempotent handlers with DB-level unique constraints on event IDs; Slack alerts on webhook processing errors |
| Client slow to fund paid service accounts | Build stalls mid-stage | Medium | Paystack / Flutterwave / Termii accounts must be live in Week 1 — treat as a hard pre-condition |
| Regulatory exposure on financial features | CBN/legal risk | Medium | All licensed activity deferred to Phase 2 with a partner; NDPR compliance from day one |

---

## 10. Build Status & TODO Checklist

This section reflects the state of development as of **July 2026**. Items are broken into three tiers: **backend API**, **frontend / contractor work**, and **commercial / ops gates**.

---

### Backend API

#### ✅ DONE

**Stage 0 — Foundation**
- [x] Repository structure, TypeScript, ESLint, Vitest configured
- [x] Zod-validated environment config with fail-fast startup
- [x] Multi-tenant architecture: schema-per-tenant, tenant middleware, schema provisioning
- [x] Auth module: JWT access + refresh tokens, bcrypt password hashing
- [x] RBAC: `owner / manager / staff / viewer` role hierarchy enforced in middleware
- [x] Request-ID middleware attached to every request
- [x] Security plugins: Helmet headers, CORS, per-route rate limiting
- [x] Multipart plugin (file uploads)
- [x] Swagger / OpenAPI documentation (dev + staging)
- [x] Structured error types and global error handler
- [x] Redis client (Upstash-compatible)
- [x] BullMQ job queue with 6 workers: `payments`, `notifications`, `documents`, `inventory`, `logistics`, `subscriptions`
- [x] Cloudflare R2 storage client
- [x] Image upload with server-side compression before R2 storage
- [x] AES-256 encryption utility for secrets at rest
- [x] Drizzle ORM with public schema + tenant schema migrations
- [x] Docker build config + Fly.io deployment manifest (`fly.toml`)
- [x] Metrics plugin (Prometheus-compatible)

**Stage 1 — Commerce Core**
- [x] Products module: create, update, soft-delete, list with category filtering
- [x] Product variants: SKU, price/kobo, cost/kobo, tax rate in basis points, attributes (JSON)
- [x] Categories module: hierarchical (parent/child)
- [x] Inventory module: per-variant per-location stock tracking
- [x] Stock movements audit trail: `receive / sale / adjustment / return / transfer`
- [x] Low-stock threshold per variant; async alert via inventory worker
- [x] Customers module: create, update, list; NDPR consent fields
- [x] Orders module: create, confirm, cancel, refund — full state machine
- [x] Order line items: server-side total calculation (subtotal, discount, tax, delivery fee)
- [x] Multi-channel order capture: `website / pos / whatsapp / manual`

**Stage 2 — Payments & Ledger**
- [x] Payment gateway abstraction layer (strategy pattern, runtime-switchable)
- [x] Paystack integration: initiate, verify, webhook handling with HMAC signature check
- [x] Flutterwave integration: initiate, verify, webhook handling with HMAC signature check
- [x] Idempotent webhook processing (unique index on `gateway_event_id`)
- [x] Double-entry ledger: `ledger_accounts`, `journal_entries`, `journal_lines`
- [x] Balanced-entry enforcement: unbalanced journal rolls back atomically
- [x] Journal templates: order payment, refund, expense
- [x] Platform wallet / reconciliation view

**Stage 3 — Subscriptions & Feature Gating**
- [x] Subscription lifecycle state machine: `trial → active → grace → lapsed`
- [x] Configuration-driven feature gating middleware (no hardcoded plan checks in handlers)
- [x] Paystack authorization code stored for auto-renewal
- [x] Subscription BullMQ worker for async billing

**Stage 4 — WhatsApp Commerce**
- [x] WhatsApp module scaffolded: routes, handler, sender, session (Redis-backed with TTL)
- [x] Meta webhook signature verification
- [x] Session state machine: `idle → browsing → cart → checkout → awaiting_payment → complete`
- [x] WhatsApp orders written to standard order pipeline with `channel = 'whatsapp'`

**Stage 5 — Reporting & Operations**
- [x] Reporting module: P&L, revenue by location, staff sales report
- [x] Expenses module: create, list, filter by date/category; auto-posts ledger entry
- [x] Invoicing module: create from order, status transitions, PDF URL field
- [x] Locations module: create, update, set default
- [x] Staff module: invite, update role, deactivate, assign to location

**Additional (beyond original plan)**
- [x] Logistics / dispatch module: TRAKA provider + generic HTTP gateway
- [x] Logistics gateway abstraction (provider-agnostic, credentials encrypted)
- [x] Logistics events table with idempotency key
- [x] Logistics BullMQ worker
- [x] Onboarding flow module (guided first-run setup)
- [x] Slack alerting for production errors (`SLACK_WEBHOOK_URL`)
- [x] Feature flags module (`src/config/features.ts`)

**Shipping Configuration Engine**
- [x] Shipping method types: `flat_rate`, `zone_rate`, `value_rate`, `weight_rate`, `automated`, `free`, `pick_up`
- [x] `shipping_zones` table — merchant-defined groups of Nigerian states with catch-all fallback
- [x] `shipping_rates` table — rate rows for zone/value/weight methods
- [x] `free_shipping_conditions` table — `always | min_order_value | product | category | promo_code`
- [x] `pickup_locations` table — covers merchant branches and third-party collection points (GIG, DHL, etc.)
- [x] Nigerian states list (`src/modules/shipping/ng-states.ts`) used for validation + storefront dropdowns
- [x] `resolveMethodFee()` calculator — determines fee for any method type given checkout context
- [x] `GET /shipping/available` — returns applicable methods + fees sorted cheapest-first
- [x] Full CRUD routes for zones, methods, rates, conditions, pickup locations (`/v1/shipping`)
- [x] `shipping:manage` feature flag (allowed on all plans)
- [x] `deliveryFeeKobo` included in order total: `total = subtotal − discount + tax + deliveryFee`
- [x] `shippingMethodId`, `pickupLocationId`, `destinationState` fields added to orders
- [x] `weightKg` field added to product variants (for weight-based shipping)

---

#### 🔲 TODO — Backend

**Invoicing**
- [x] PDF generation service: pdf-lib renders invoice → uploads to R2 → writes signed URL to `invoices.pdf_url`
- [x] Send invoice via email (Resend) when status changes to `sent` — skipped gracefully if `RESEND_API_KEY` is not set

**WhatsApp**
- [ ] End-to-end live test of WhatsApp flow once Meta Business API approval is granted
- [ ] WhatsApp product catalogue message (interactive list format) for browsing
- [ ] WhatsApp payment link delivery via Paystack-hosted checkout

**Reporting**
- [x] CSV export endpoint for P&L (`GET /reports/pl/export`) and staff sales (`GET /reports/staff-sales/export`)
- [x] Inventory valuation report (`GET /reports/inventory-valuation?format=csv|json`) — quantity × cost per variant per location, gated to `reporting:margin`

**Testing**
- [ ] Integration test suite covering the payment → ledger path end-to-end
- [ ] Integration tests for WhatsApp session state machine
- [ ] Load test validation (confirm targets under simulated multi-tenant load)

**Operational hardening**
- [ ] Backup configuration: automated PostgreSQL backups on Neon + restore test
- [ ] Structured log drain: ship logs to a persistent store (Axiom, Loki, or equivalent)
- [ ] Health check endpoint returning DB + Redis + queue status
- [ ] Graceful shutdown: drain in-flight jobs before process exit

---

### Frontend (Contractor Deliverables)

- [ ] **Merchant Dashboard (web)** — full desktop + mobile-responsive React/Next.js app
  - [ ] Auth screens: login, forgot password, staff invite accept
  - [ ] Dashboard home: KPI tiles (revenue, orders, low stock)
  - [ ] Product catalogue management UI
  - [ ] Inventory management + stock adjustment form
  - [ ] Order list with filters + status update actions
  - [ ] Customer directory
  - [ ] Expenses entry form + receipt upload
  - [ ] Invoice list + PDF download
  - [ ] Reports page: P&L, revenue by location, staff sales
  - [ ] Staff management (invite, role change, deactivate)
  - [ ] Location management
  - [ ] Settings: subscription plan, billing, business profile
- [ ] **Customer Storefront (web)** — public-facing per-merchant site
  - [ ] Product listing page with category filter
  - [ ] Product detail page with variant selector and add-to-cart
  - [ ] Cart and checkout flow
  - [ ] Paystack payment redirect and success/failure pages
  - [ ] Order confirmation page with order number
- [ ] **POS interface (web + mobile-optimised)**
  - [ ] Full-screen product search + add-to-cart
  - [ ] Discount application (line and order level)
  - [ ] Payment method selection (card / transfer / cash / split)
  - [ ] Receipt print / share flow
  - [ ] Exit POS button returning to dashboard

---

### Commercial & Operational Gates

- [ ] Term sheet open items agreed in writing (equity %, vesting, retainer, IP ownership)
- [ ] Formal Memorandum of Agreement signed by both parties
- [ ] Client registered business entity confirmed
- [ ] **Meta WhatsApp Business API application submitted** ← critical path, 2–4 week review
- [ ] Paystack merchant account live under client entity
- [ ] Flutterwave merchant account live under client entity
- [ ] Termii SMS account live
- [ ] Primary domain registered and DNS access secured
- [ ] Settlement bank account decided and configured
- [ ] Web/mobile frontend contractor identified, scoped, and contracted
- [ ] Client-side product decision POC named
- [ ] Production environment provisioned (Fly.io or Hetzner + Dokploy)
- [ ] Neon production database provisioned and connection string secured
- [ ] Upstash Redis production instance provisioned
- [ ] Cloudflare R2 production bucket created

---

### Phase 1 Definition of Done

All of the following must be true before Phase 1 is considered complete:

- [ ] Platform is live on production infrastructure
- [ ] At least one real merchant is onboarded and operational
- [ ] Real payments are flowing through Paystack or Flutterwave
- [ ] Orders can be placed via at least two channels (website + POS minimum)
- [ ] WhatsApp ordering is live or formally deferred pending Meta approval
- [ ] The double-entry ledger produces an accurate P&L for the merchant
- [ ] Subscription billing auto-renews without manual intervention
- [ ] Backups are configured and a restore has been tested
- [ ] Observability stack confirms < 1% error rate under normal load
- [ ] Front-loaded equity vest condition (per term sheet) is satisfied

---

*Document maintained by Stephen Oyeyemi. Update the TODO section as items are completed or new requirements are identified. Do not add Phase 2 items to the Phase 1 TODO without an explicit scope trade-off.*
