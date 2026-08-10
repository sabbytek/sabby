# [Platform Name] — UI/UX Design Brief

**Version:** 1.0  
**Prepared for:** Web & Mobile Contractor  
**Backend API base URL:** `/v1/`  
**API docs:** `/documentation` (Swagger UI, auto-generated)  
**Scope:** Phase 1 — four surfaces: Customer Storefront, Merchant Dashboard, POS, WhatsApp Flow Reference

---

## Table of Contents

1. [Design Principles](#1-design-principles)
2. [Design System Foundation](#2-design-system-foundation)
3. [Surface 1 — Customer Storefront](#3-surface-1--customer-storefront)
4. [Surface 2 — Merchant Dashboard](#4-surface-2--merchant-dashboard)
5. [Surface 3 — POS (Point of Sale)](#5-surface-3--pos-point-of-sale)
6. [Surface 4 — WhatsApp Flow Reference](#6-surface-4--whatsapp-flow-reference)
7. [Mobile Responsiveness](#7-mobile-responsiveness)
8. [Nigerian Localization](#8-nigerian-localization)
9. [Role-Based UI Rules](#9-role-based-ui-rules)
10. [API Surface Map](#10-api-surface-map)

---

## 1. Design Principles

### 1.1 The Core Aesthetic

The visual language is **clean, minimal enterprise** — the same restraint Apple uses on its marketing pages and in macOS: generous whitespace, surgical use of color, typography that does the heavy lifting. Nothing decorates for its own sake. Every element earns its place.

| Principle | What it means in practice |
|-----------|--------------------------|
| **Whitespace is the layout** | Content breathes. Sections are separated by space, not dividers. Avoid card-within-card nesting. |
| **One thing at a time** | Each screen has a single primary action. Secondary and tertiary actions are smaller, further away, or behind a menu. |
| **Data is the hero on management screens** | Tables, numbers, and status are legible at a glance — no decorative chrome competing with the information. |
| **Trust is the hero on customer screens** | Merchant branding, product photography, and clear pricing create confidence. Payment feels safe. |
| **Invisible hierarchy** | Font weight and size alone create hierarchy. No bold colored banners, no gradient headers. |
| **Earn color** | Color is used for state only: success, warning, danger, accent CTA. Never for decoration. |

### 1.2 Tone by Surface

| Surface | Tone |
|---------|------|
| Customer Storefront | Warm, inviting, trustworthy. Friendly but not casual. |
| Merchant Dashboard | Calm, efficient, professional. Information-dense but never cluttered. |
| POS | Fast, focused, zero-distraction. Built for the cashier in a busy shop. |
| WhatsApp Flows | Conversational, concise, familiar. Reads like a helpful assistant, not a bot. |

---

## 2. Design System Foundation

### 2.1 Color Tokens

The palette is monochrome with a **single accent**. The client selects the accent color; the recommendation is **Indigo** (see note below). All colors are exposed as CSS custom properties so a brand color swap is a single-token change.

```css
/* Background layers */
--color-bg:           #FFFFFF;   /* Page background */
--color-surface:      #F9F9F9;   /* Cards, sidebar, panels */
--color-surface-2:    #F2F2F2;   /* Hover states, nested surfaces */

/* Text */
--color-text-primary:    #111111;   /* Headlines, primary labels */
--color-text-secondary:  #6B6B6B;   /* Supporting text, timestamps */
--color-text-disabled:   #ADADAD;   /* Placeholder, locked UI */
--color-text-inverse:    #FFFFFF;   /* Text on dark/accent backgrounds */

/* Border */
--color-border:          #E5E5E5;   /* Default border */
--color-border-focus:    var(--color-accent);

/* Accent (single brand color — client override) */
--color-accent:          #4F46E5;   /* Recommended: Indigo 600 */
--color-accent-hover:    #4338CA;   /* Indigo 700 */
--color-accent-light:    #EEF2FF;   /* Indigo 50 — badge backgrounds, subtle highlights */

/* Semantic states */
--color-success:         #16A34A;   /* Green 600 */
--color-success-bg:      #F0FDF4;   /* Green 50 */
--color-warning:         #D97706;   /* Amber 600 */
--color-warning-bg:      #FFFBEB;   /* Amber 50 */
--color-danger:          #DC2626;   /* Red 600 */
--color-danger-bg:       #FEF2F2;   /* Red 50 */
--color-info:            #0284C7;   /* Sky 600 */
--color-info-bg:         #F0F9FF;   /* Sky 50 */

/* Overlay */
--color-overlay:         rgba(0,0,0,0.40);
```

> **Accent color rationale:** Indigo sits between blue (trust) and purple (premium) without the green-bank association already saturated by Kuda, Opay, and Flutterwave in the Nigerian fintech space. It reads as modern and confident. If the client has a brand color, replace `--color-accent` and `--color-accent-hover` only.

### 2.2 Typography

**Primary typeface:** [Inter](https://fonts.google.com/specimen/Inter) — open source, closest web equivalent to SF Pro, with excellent numeral rendering at small sizes. Load via `<link rel="preconnect">` + Google Fonts subset (Latin only).

```
Scale (rem, base = 16px):

Display:    2.25rem / 36px — page headlines, storefront hero
Heading 1:  1.875rem / 30px — section titles
Heading 2:  1.5rem / 24px   — card titles, sub-section headers
Heading 3:  1.25rem / 20px  — widget titles, drawer headers
Body:       1rem / 16px     — primary reading content
Body sm:    0.875rem / 14px — table rows, labels, secondary text
Caption:    0.75rem / 12px  — timestamps, footnotes, badges

Line heights:
  Display/Headings: 1.2
  Body:             1.6
  Body sm / Caption: 1.5

Weights in use:
  400 (Regular)  — body, table values
  500 (Medium)   — table column headers, navigation items
  600 (SemiBold) — section titles, card headers, button labels
  700 (Bold)     — display numbers (KPI values), hero text
```

No italic use in UI. Italics reserved for legal/disclaimer text only.

### 2.3 Spacing Scale

Base unit: **4px**. All spacing values are multiples.

| Token | Value | Typical use |
|-------|-------|-------------|
| `space-1` | 4px | Icon gap, tight inline spacing |
| `space-2` | 8px | Badge padding, compact lists |
| `space-3` | 12px | Input padding (vertical) |
| `space-4` | 16px | Default padding, card inner |
| `space-5` | 20px | Section sub-gap |
| `space-6` | 24px | Card gap, form field gap |
| `space-8` | 32px | Section gap |
| `space-10` | 40px | Major section spacing |
| `space-12` | 48px | Page top padding |
| `space-16` | 64px | Hero section padding |

### 2.4 Corner Radius

```
--radius-sm:   4px    — badges, chips, input fields
--radius-md:   8px    — cards, modals, dropdowns
--radius-lg:   12px   — large cards, image containers
--radius-xl:   16px   — mobile bottom sheets
--radius-full: 9999px — pills, avatar circles
```

No heavy rounding (no 24px+ cards on desktop). Restraint matches the Apple aesthetic.

### 2.5 Shadow System

One elevation level only. Shadows signal "this layer is above the page", used exclusively for modals, dropdowns, and toasts.

```css
--shadow-sm:  0 1px 2px rgba(0,0,0,0.05);                  /* Subtle card lift */
--shadow-md:  0 4px 6px -1px rgba(0,0,0,0.07),
              0 2px 4px -1px rgba(0,0,0,0.04);             /* Dropdown, popover */
--shadow-lg:  0 10px 15px -3px rgba(0,0,0,0.08),
              0 4px 6px -2px rgba(0,0,0,0.04);             /* Modal, drawer */
```

Cards on dashboard: `border: 1px solid var(--color-border)` only — no shadow. Shadows for floating layers only.

### 2.6 Icon System

Use **Heroicons** (outline, 20px stroke) or **Lucide**. Stroke width: 1.5px. Size: 20px in UI; 24px in hero/empty states; 16px in badges and compact rows. Never fill icons in non-active state. Active nav item: filled variant of the same icon.

### 2.7 Core Components

#### Buttons

```
Primary:    bg=accent, text=inverse, hover=accent-hover
Secondary:  bg=transparent, border=border, text=primary, hover=surface-2
Danger:     bg=danger, text=inverse (destructive actions only)
Ghost:      bg=transparent, no border, text=secondary, hover=surface-2
Link:       inline, text=accent, no background

Sizes:
  sm: h-8  (32px), px-3, text-sm   — table row actions
  md: h-10 (40px), px-4, text-sm   — default form actions
  lg: h-12 (48px), px-6, text-base — primary CTAs, POS actions

States: default, hover, focus (2px accent ring, 2px offset), loading (spinner), disabled (opacity-50)
Min tap target: 44px height on mobile regardless of visual size
```

#### Inputs

```
Height: 40px (h-10)
Border: 1px solid var(--color-border), radius-sm
Focus:  border-color=accent, box-shadow=0 0 0 2px var(--color-accent-light)
Error:  border-color=danger; error message below (12px, danger color)
Disabled: bg=surface-2, cursor=not-allowed

Label: 14px, medium weight, above the input, 4px gap
Placeholder: text-disabled color
Helper text: 12px, text-secondary, below input
```

#### Cards

```
bg=white, border=1px solid border, radius-md, padding=space-6
No shadow (border only). 
Hover on clickable cards: bg=surface transition 150ms
```

#### Badges / Status Chips

```
shape: pill (radius-full)
padding: 2px 8px
text: 12px, medium weight, uppercase optional for order status
```

| Status | Color |
|--------|-------|
| Draft | gray background, gray text |
| Confirmed | info-bg, info text |
| Processing | warning-bg, warning text |
| Fulfilled | success-bg, success text |
| Cancelled | surface-2, text-secondary |
| Refunded | danger-bg, danger text |
| Paid | success-bg, success text |
| Pending | warning-bg, warning text |
| Failed | danger-bg, danger text |

#### Toast Notifications

```
Position: top-right (desktop), top-center (mobile)
Width: 360px max
Variants: success, warning, error, info (colored left border, semantic icon)
Duration: 4s auto-dismiss; persistent for errors
Stacking: max 3 visible, LIFO dismissal
```

#### Modals & Drawers

```
Modal:  centered, max-w-lg, bg=white, shadow-lg, radius-md, backdrop=overlay
Drawer: slides from right, w=480px (desktop) / full-screen (mobile), shadow-lg
Both:   close on Esc, close on backdrop click, trap focus
```

#### Empty States

Every empty list/table/section needs an empty state:
```
Layout: centered, icon (24px, text-disabled), heading (16px, text-primary), 
        supporting text (14px, text-secondary), optional CTA button
```

#### Loading States

```
Skeleton loaders: animated pulse, same dimensions as the content they replace
  — table rows: 3-5 skeleton rows at 40px height
  — cards: rectangular block with header/body placeholder lines
  — KPI widgets: circle + two lines
Full-page spinner: only for initial auth check
```

---

## 3. Surface 1 — Customer Storefront

### 3.1 Overview

The public-facing shop for a specific merchant's products. Each merchant gets their own storefront subdomain or path. The customer experience is conversion-focused: find product → add to cart → pay → confirmation. Built to work on low-bandwidth mobile connections.

### 3.2 Screen Inventory

#### Screen 01 — Homepage / Catalogue

**Purpose:** First impression. Drive product discovery and conversion.

**Layout (Desktop):**
```
┌─────────────────────────────────────────┐
│  Logo         Search          Cart (n)  │  ← sticky header, bg=white, border-bottom
├─────────────────────────────────────────┤
│  Category pills (scrollable horizontal) │  ← filter bar
├─────────────────────────────────────────┤
│                                         │
│  Hero banner (optional, merchant sets)  │
│                                         │
├─────────────────────────────────────────┤
│  FEATURED PRODUCTS                      │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐  │
│  │ img  │ │ img  │ │ img  │ │ img  │  │  ← 4-col grid
│  │Name  │ │Name  │ │Name  │ │Name  │  │
│  │₦5,000│ │₦1,200│ │₦8,500│ │₦3,000│  │
│  └──────┘ └──────┘ └──────┘ └──────┘  │
└─────────────────────────────────────────┘
```

**Mobile (375px):**
- Sticky header: logo left, search icon + cart icon right
- Category pills: horizontal scroll, no wrapping
- Product grid: 2 columns
- Sticky "View Cart" button at bottom when cart has items

**Components:**
- Product card: image (aspect ratio 1:1, object-fit cover, lazy-load with blur placeholder), product name, price in ₦, optional "Out of stock" overlay
- If product has variants: clicking the card goes to detail page. No "Add to cart" directly from grid (forces variant selection)
- If product has only one variant: "Add to cart" button appears directly on card hover (desktop) / always visible (mobile)

**Data:** `GET /v1/products?isActive=true&categoryId={id}&search={q}&limit=24&offset={n}`

---

#### Screen 02 — Product Detail Page

**Purpose:** Full product information and variant selection before purchase.

**Layout:**
```
┌───────────────────────────────────────────┐
│  ← Back     Product Name                  │
├────────────────────┬──────────────────────┤
│                    │  Product Name         │
│   Product image    │  ₦5,000               │
│   gallery          │  ─────────────────    │
│   (swipeable)      │  Colour: ● ● ●        │  ← variant attributes
│                    │  Size:   S  M  L  XL  │
│                    │  ─────────────────    │
│                    │  [Add to Cart]        │  ← primary CTA
│                    │  ─────────────────    │
│                    │  Description…         │
│                    │  VAT inclusive (7.5%) │
├────────────────────┴──────────────────────┤
│  You might also like…                     │
└───────────────────────────────────────────┘
```

**Mobile:** Stacked layout. Image gallery full-width (swipeable). Variant selector + Add to Cart pinned to bottom of screen as a sticky action bar.

**Rules:**
- Show VAT note if `taxRateBps > 0` on the selected variant. Display: "Price includes 7.5% VAT"
- Out-of-stock variants: visually disabled (line-through label, not selectable)
- Quantity selector: +/- stepper, minimum 1, maximum = stock on hand (from inventory)
- If no variants: single price display, direct Add to Cart

**Data:** `GET /v1/products/{id}` (includes variants)

---

#### Screen 03 — Cart

**Layout (slide-over drawer on desktop, full page on mobile):**

```
┌────────────────────────────────────┐
│  Your Cart (3 items)          ×    │
├────────────────────────────────────┤
│  [Product img]  Name               │
│                 Variant: Red, M    │
│                 ₦5,000   [-] 2 [+] │
│                          [Remove]  │
├────────────────────────────────────┤
│  [Product img]  Name               │
│  ...                               │
├────────────────────────────────────┤
│                   Subtotal  ₦12,000│
│                   VAT (7.5%) ₦900  │
│                   ──────────────   │
│                   Total    ₦12,900 │
│                                    │
│          [Proceed to Checkout]     │
└────────────────────────────────────┘
```

**Rules:**
- Line totals update instantly on quantity change (client-side calculation)
- Show "Continue Shopping" link if cart is empty
- VAT line only appears if any item has a tax rate
- Promo code field: deferred to Phase 2 — do not include

---

#### Screen 04 — Checkout

**Purpose:** Capture customer details and hand off to Paystack for payment.

**Steps:** 1 → Contact info → 2 → Delivery/collection → 3 → Review → Pay

**Step 1 — Contact:**
```
First name  [          ]   Last name  [          ]
Email       [                                    ]
Phone       [+234                               ]

☑ I agree to the [Privacy Policy] and consent to my data being stored 
  for order processing. (NDPR consent — required)
```

**Step 2 — Delivery (if applicable):**
- Delivery address fields OR "Pick up in store" option
- If in-store only: skip this step

**Step 3 — Order Review:**
- Read-only line items, totals confirmation
- Displayed: items, subtotal, VAT, delivery fee (if any), total
- **Pay button:** triggers `POST /v1/payments/initiate` with `{orderId, customerEmail}`
  - Response includes `authorizationUrl` → redirect to Paystack-hosted checkout
  - Show loading spinner on button during API call

**NDPR note:** Consent checkbox is required. Blocked submission if unchecked. Log `consentSource: "web_checkout"` when creating the customer record via `POST /v1/customers`.

**Data flow:**
1. `POST /v1/orders` → creates draft order
2. `POST /v1/payments/initiate` → get Paystack URL
3. Redirect to Paystack
4. Paystack redirects back to `→ Order Confirmation` screen with `?reference=XXX`

---

#### Screen 05 — Order Confirmation

**Purpose:** Reassure the customer that their order is placed and payment received.

```
┌───────────────────────────────────┐
│                                   │
│     ✓  (large success icon)       │
│                                   │
│   Order Confirmed!                │
│   ORD-000042                      │
│                                   │
│   We'll send a confirmation to    │
│   john@example.com                │
│                                   │
│   ─── Order Summary ───           │
│   2× Red T-Shirt M      ₦10,000  │
│   VAT                     ₦750   │
│   Total                 ₦10,750  │
│                                   │
│   [Track My Order]                │
│   [Continue Shopping]             │
│                                   │
└───────────────────────────────────┘
```

**Data:** Poll or read the order from `GET /v1/orders/{id}` using the reference from Paystack callback.

---

#### Screen 06 — Order Status Tracker

**Purpose:** Let customers check their order status without an account.

- Input: order number + email
- Display: order status timeline (Placed → Confirmed → Processing → Fulfilled)
- Status steps are visually connected with a progress line
- If cancelled: show cancellation note

---

### 3.3 Storefront Navigation

```
Desktop header (sticky):
  Left:   [Logo]
  Center: [Search bar — full width]
  Right:  [Cart icon (badge with count)]

Mobile header (sticky):
  Left:   [Logo]
  Right:  [Search icon] [Cart icon (badge)]

Footer:
  [Business name] · [WhatsApp contact] · [Privacy Policy] · Powered by [Platform Name]
```

---

## 4. Surface 2 — Merchant Dashboard

### 4.1 Layout System

**Desktop (1280px+):**
```
┌──────────┬──────────────────────────────────────────┐
│          │  Top bar: [Tenant name] [Bell] [Avatar]  │
│  Sidebar │─────────────────────────────────────────│
│  nav     │                                          │
│  (240px) │  Page content                            │
│          │                                          │
│          │                                          │
└──────────┴──────────────────────────────────────────┘
```

**Tablet (768px–1279px):** Sidebar collapses to icon-only (64px). Hover or click expands to full sidebar as an overlay.

**Mobile (<768px):** Sidebar hidden. Bottom tab bar with 5 items: Home, Orders, Products, Customers, More (opens a slide-up menu with remaining items).

### 4.2 Sidebar Navigation

```
[Logo]

Home
Orders
Products
Inventory
Customers

── Finance ──
P&L Report
Expenses
Ledger
Wallet

── Operations ──
Staff
Locations         ← growth+ only
Subscriptions

── ──
Settings
```

Active item: filled icon + accent text color + subtle accent-light left border (3px).  
Locked items (gated features): grayed out with lock icon. Clicking shows upgrade prompt instead of navigating.

### 4.3 Top Bar

```
[Tenant / Business Name]              [🔔 n]  [Avatar ▾]
                                               └ My Profile
                                                 Switch to POS
                                                 ─────────────
                                                 Log out
```

- Notification bell: shows count badge. Clicking opens a slide-over panel listing recent alerts (low stock, new order, payment received)
- Avatar: initials fallback if no photo

---

### 4.4 Section — Home / Overview

**Purpose:** Single-glance operational pulse for the business owner/manager.

**KPI Cards (top row):**
```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ Today Revenue│  │ Pending Ord. │  │  Wallet Bal. │  │   Low Stock  │
│ ₦125,000     │  │ 8 orders     │  │  ₦2,341,000  │  │ 3 variants   │
│ ▲ 12% vs ydy│  │              │  │              │  │ view →        │
└──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘
```

KPI cards are clickable — navigate to the relevant section.

**Recent Orders table (last 10):**
- Columns: Order #, Customer, Channel, Total, Status, Time
- Click row → opens Order Detail drawer

**Low Stock Alert widget:** Compact list of variants at or below threshold. Link to Inventory section.

**Subscription status banner (if trial or grace):**
```
⚠ You are on a free trial. 14 days remaining.  [Upgrade Now →]
```

**Data:**
- `GET /v1/ledger/wallet` — wallet balance
- `GET /v1/orders?status=confirmed&limit=10` — pending orders count
- `GET /v1/inventory/low-stock` — low stock alerts
- `GET /v1/orders?limit=10&sort=createdAt:desc` — recent orders

---

### 4.5 Section — Orders

**Purpose:** Unified order pipeline across all channels. Main operational screen for staff and managers.

**List view:**
```
[+ New Order]          [Search...]   [Status ▾]  [Channel ▾]  [Date range ▾]

  #          Customer      Channel    Total      Status        Payment    Time
  ─────────────────────────────────────────────────────────────────────────────
  ORD-000042 Amaka Obi     POS        ₦12,500    Processing   Paid       2h ago
  ORD-000041 —             WhatsApp   ₦3,200     Confirmed    Pending    3h ago
  ORD-000040 John Eze      Website    ₦45,000    Fulfilled    Paid       Yesterday
```

- Channel icons: POS icon / WhatsApp icon / Globe icon / Manual (keyboard) icon
- Pagination: "Showing 1–25 of 142 orders" + Prev / Next
- Mobile: condensed table (Order # + Status + Total per row); tap to expand

**Order Detail Drawer (slides from right):**
```
Order ORD-000042                     ×

Channel: POS         Status: [Processing ▾]   Payment: Paid

Customer: Amaka Obi · 0801 234 5678

Items:
  2× Red T-Shirt (M)     ₦5,000    ₦10,000
  1× Belt (Black)        ₦2,500     ₦2,500
                         ─────────────────
  Subtotal                          ₦12,500
  Discount                           -₦0
  VAT                               ₦938
  Total                            ₦13,438

Payment: Paid via Paystack · Ref: PSK_abc123

Actions:
  [Process →]  [Fulfil →]  [Cancel order]   ← state-transition buttons
```

State-transition button visibility:
- `draft` → show [Confirm] (manager+), [Cancel]
- `confirmed` → show [Process →], [Cancel]
- `processing` → show [Fulfil →], [Cancel]
- `fulfilled` → show [Refund] (if payment = paid, feature gated: `payments:refund`)
- `cancelled` / `refunded` → no action buttons, read-only

**New Order (manual entry):**
A full-page or drawer form:
1. Customer lookup (search by name/phone) or "Walk-in" (no customer)
2. Product search + variant picker + quantity
3. Optional discount (flat or percent, manager+ only)
4. Order totals preview
5. [Create Draft] or [Create + Confirm]

**Data:**
- `GET /v1/orders?status={s}&channel={c}&startDate={d}&endDate={d}&search={q}`
- `GET /v1/orders/{id}`
- `POST /v1/orders`
- `POST /v1/orders/{id}/confirm|process|fulfil|cancel`

---

### 4.6 Section — Products

**Purpose:** Manage product catalogue including categories and variants.

**List view:**
```
[+ Add Product]      [Search...]   [Category ▾]  [Status ▾]   [Grid | Table ▾]

Table mode:
  Name              Category    Variants   Price from    Status
  ────────────────────────────────────────────────────────────
  Red T-Shirt       Clothing    3          ₦5,000        Active
  Leather Belt      Accessories 2          ₦2,500        Active
  Out of Stock Item Shoes       1          ₦12,000       Active  ⚠ low stock

Grid mode (3-col desktop, 2-col tablet, 2-col mobile):
  [product image] product name, price range, variant count badge
```

**Product Detail / Edit (full page or wide drawer):**
```
Tabs: [Details] [Variants] [Inventory]

Details tab:
  Name        [                    ]
  Description [                    ]
  Category    [Dropdown ▾          ]
  Status      [Active ▾            ]
  Image       [Upload or URL       ]

Variants tab:
  SKU      Name        Price    Cost*   Tax    Attributes       Stock
  ──────────────────────────────────────────────────────────────────────
  SKU-001  Red / M    ₦5,000  ₦2,100*  7.5%  {color:red,size:M}  12
  SKU-002  Red / L    ₦5,000  ₦2,100*  7.5%  {color:red,size:L}   3  ⚠
  [+ Add Variant]

  * Cost column hidden for staff role

Inventory tab:
  → Redirects/deep links to Inventory section filtered to this product
```

**Data:**
- `GET /v1/products?categoryId={id}&isActive={b}&search={q}`
- `GET /v1/products/{id}`
- `POST /v1/products`
- `PATCH /v1/products/{id}`
- `POST /v1/products/{id}/variants`
- `PATCH /v1/products/{id}/variants/{vid}`
- `GET /v1/products/categories`

---

### 4.7 Section — Inventory

**Purpose:** Track stock levels, receive new stock, adjust quantities, view movement history.

**Stock Levels table:**
```
[Receive Stock]  [Adjust Stock]     [Search variant...]   [Location ▾]

Variant          SKU       Location     On Hand   Threshold   Status
──────────────────────────────────────────────────────────────────────
Red T-Shirt / M  SKU-001   Main Store   12        5           ✓ OK
Red T-Shirt / L  SKU-002   Main Store   3         5           ⚠ Low
Leather Belt / S SKU-003   Main Store   0         5           ✗ Out
```

Status badge: OK (success), Low (warning), Out of Stock (danger).

**Receive Stock modal:**
```
Product/Variant  [Search and select ▾          ]
Location         [Main Store ▾                 ]
Quantity         [    ]  units
Note (optional)  [                             ]
                 [Cancel]  [Confirm Receipt]
```

**Adjust Stock modal:**
```
Product/Variant  [Search and select ▾          ]
Location         [Main Store ▾                 ]
Adjustment       [-] [  ] [+]  (negative = write-off)
Reason           [                             ]
                 [Cancel]  [Apply Adjustment]
```

**Stock Movement History:**
- Filterable table: type (receive/sale/adjustment/return), variant, date range
- Columns: Date, Type, Variant, Location, Qty Change, Reference (order link), Note, By

**Low-Stock Alert Feed (sidebar widget or dedicated tab):**
- Compact list of variants at/below threshold
- Quick-action "Receive Stock" button per row

**Data:**
- `GET /v1/inventory?locationId={id}&variantId={id}`
- `POST /v1/inventory/receive`
- `POST /v1/inventory/adjust`
- `GET /v1/inventory/movements?type={t}&startDate={d}&endDate={d}`
- `GET /v1/inventory/low-stock`

---

### 4.8 Section — Customers

**Purpose:** CRM view — manage customer records and order history.

**List view:**
```
[+ Add Customer]     [Search name, phone, email...]

Name            Phone          Email                Orders   Last order
─────────────────────────────────────────────────────────────────────────
Amaka Obi       0801 234 5678  amaka@example.com    7        2 days ago
John Eze        0702 111 2222  —                    2        1 week ago
```

**Customer Detail panel (slide-over or inline expand):**
```
Amaka Obi
0801 234 5678 · amaka@example.com
Lagos, Nigeria

NDPR Consent: ✓ Given (web_checkout · 12 Jun 2026)
Note: Prefers delivery on weekdays

Order history:
  ORD-000042  ₦13,438  Processing  2 days ago  →
  ORD-000035  ₦5,000   Fulfilled   1 week ago  →

[Edit Customer]
```

**NDPR Consent display:** Always show consent status. If no consent, show "Not recorded" in warning color. Provide inline option to record manual consent with `consentSource: "manual"`.

**Data:**
- `GET /v1/customers?search={q}`
- `GET /v1/customers/{id}`
- `POST /v1/customers`
- `PATCH /v1/customers/{id}`

---

### 4.9 Section — Finance

Finance section has a sub-navigation: `P&L | Ledger | Expenses | Wallet | Invoices`

Feature gate: Finance section is hidden entirely for the `staff` role.

#### 4.9.1 P&L Report (feature gate: `reporting:pl`)

```
Profit & Loss Report
Period: [This Month ▾]  [Custom range ▾]            [Export CSV]

Revenue                                   ₦2,341,000
Cost of Goods Sold                         -₦987,000
                                          ──────────
Gross Profit                              ₦1,354,000   (57.8% margin)*
Operating Expenses                         -₦234,500
Payment Processing Fees                     -₦47,000
                                          ──────────
Net Profit                                ₦1,072,500

* Margin analysis feature gate: reporting:margin
```

Period presets: Today, This Week, This Month, Last Month, Custom.

#### 4.9.2 Ledger

```
Journal Entries
[Filter by reference type ▾]  [Search reference...]

Date         Reference       Description           Debit      Credit
──────────────────────────────────────────────────────────────────────
12 Jun 2026  PAY-001         Order ORD-000042      ₦13,438
12 Jun 2026  PAY-001         Revenue               ₦0         ₦12,500
12 Jun 2026  PAY-001         VAT Payable                        ₦938
```

Chart of accounts summary at top:
```
Account          Type      Balance
1000 Cash        Asset     ₦2,341,000
4000 Revenue     Revenue   ₦5,200,000
5100 Fees        Expense      ₦47,000
...
```

#### 4.9.3 Expenses (feature gate: `expenses:track`)

```
[+ Record Expense]    [Filter by category ▾]   [Date range ▾]

Date        Category     Description       Amount     Receipt   By
──────────────────────────────────────────────────────────────────
10 Jun 2026 rent         June Shop Rent   ₦150,000    📎       Amaka
08 Jun 2026 utilities    EKEDC Bill        ₦22,000    📎       Amaka
```

**Record Expense modal:**
```
Description   [                    ]
Amount        ₦ [                  ]
Category      [Dropdown: rent/utilities/supplies/other]
Date          [Date picker         ]
Location      [Main Store ▾        ]  ← optional
Receipt       [Upload file         ]  ← URL stored in receiptUrl
              [Cancel]  [Save Expense]
```

#### 4.9.4 Wallet

```
Platform Wallet

Available Balance           ₦2,341,000

  (Last updated: just now)

Recent credit entries...
```

Note: Wallet balance is derived from the Cash account (1000) in the ledger. Display as read-only.

#### 4.9.5 Invoices (feature gate: `invoicing:generate`)

```
[+ Generate Invoice]     [Search order #...]    [Status ▾]

Invoice #    Order       Customer    Issued       Due        Amount      Status
─────────────────────────────────────────────────────────────────────────────────
INV-0001     ORD-000030  Amaka Obi   01 Jun 2026  15 Jun     ₦45,000    Sent
```

Generate Invoice: select order → pre-fill line items → set due date → [Generate PDF].

---

### 4.10 Section — Staff

**Purpose:** Manage team members and their roles. Owner only.

```
[+ Invite Staff Member]

Name         Email                  Role       Status    Last login
──────────────────────────────────────────────────────────────────────
Amaka Obi    amaka@example.com      Manager    Active    Today
James Ideh   james@example.com      Staff      Active    Yesterday
Ngozi Bello  ngozi@example.com      Viewer     Invited   Never
```

**Invite modal:**
```
First name  [          ]  Last name  [          ]
Email       [                                   ]
Role        [Staff ▾                            ]
            [Cancel]  [Send Invite]
```

**Role permission matrix (read-only display below the table):**

| Action | Owner | Manager | Staff | Viewer |
|--------|-------|---------|-------|--------|
| Create & confirm orders | ✓ | ✓ | Draft only | — |
| View cost & margin | ✓ | ✓ | — | — |
| Manage products | ✓ | ✓ | — | — |
| Adjust inventory | ✓ | ✓ | — | — |
| View reports | ✓ | ✓ | — | ✓ |
| Process refunds | ✓ | ✓ | — | — |
| Invite staff | ✓ | — | — | — |
| Manage subscription | ✓ | — | — | — |

Plan limit display: "5 of 5 staff slots used. Upgrade to Growth for more."

---

### 4.11 Section — Locations (feature gate: `locations:manage`, Growth+)

```
[+ Add Location]

[Main Store]                          [Secondary Outlet]
Address: 14 Allen Avenue, Lagos       Address: 23 GRA, PH
Phone: 0801 000 0000                  Phone: 0702 000 0000
Status: ● Default  Active             Status: Active
[Edit]                                [Edit] [Deactivate]
```

Trial / Entry users see this section locked: "Multi-location is available on the Growth plan. [Upgrade →]"

---

### 4.12 Section — Subscriptions

**Purpose:** Show current plan, allow upgrades. Accessible even when subscription is lapsed.

```
Current Plan: Entry  ·  Status: Active
Billing cycle: Monthly  ·  Next renewal: 01 Jul 2026  ·  ₦3,500/month

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

                    Entry         Growth        Enterprise
Price/month:        ₦3,500        ₦10,000       Custom
Orders:             Unlimited     Unlimited     Unlimited
Staff:              5             20            Unlimited
Locations:          1             Unlimited     Unlimited
WhatsApp ordering:  —             ✓             ✓
P&L reports:        ✓             ✓             ✓
Multi-location:     —             ✓             ✓
                                  [Upgrade →]   [Contact us]
```

**Lapsed state (full-screen paywall):**
```
Your subscription has lapsed.

To continue using [Platform Name], please renew your subscription.

                    [Renew — ₦3,500/month]

          Need help? Contact support on WhatsApp
```

---

### 4.13 Section — Settings

```
Tabs: [Business Info] [Notifications] [Payments] [Security]

Business Info:
  Business name  [              ]
  Phone          [              ]
  Address        [              ]
  Logo           [Upload        ]
  [Save Changes]

Notifications:
  ☑  Email me when a new order is placed
  ☑  Email me when payment is received
  ☑  Email me when stock is low
  ☐  WhatsApp notifications (coming soon)

Payments:
  Paystack:      ● Connected (test mode / live mode indicator)
  Flutterwave:   ○ Not connected  [Connect →]

Security:
  Change password
  Active sessions (list + revoke option)
```

---

## 5. Surface 3 — POS (Point of Sale)

### 5.1 Overview

The POS is a **distraction-free, speed-optimized** selling interface. Designed for a cashier standing at a counter, primarily on a tablet (768px landscape) or a mobile phone (375px). No sidebar navigation. Accessed via "Switch to POS" from the dashboard top bar.

### 5.2 POS Layout

```
┌────────────────────────────────────────────────────────────────────┐
│ ← Exit POS    [Platform Name] POS    Location: Main Store  Amaka ▾│
├────────────────────────────┬───────────────────────────────────────┤
│                            │  CURRENT SALE                         │
│  [🔍 Search products...]  │  ──────────────────────────────────── │
│                            │  2× Red T-Shirt / M  ₦10,000         │
│  ┌───┐ ┌───┐ ┌───┐        │    [-] 2 [+]  [×]                    │
│  │img│ │img│ │img│        │  1× Belt / Black      ₦2,500          │
│  │Tee│ │Bag│ │Hat│        │    [-] 1 [+]  [×]                    │
│  │₦5k│ │₦3k│ │₦2k│        │  ──────────────────────────────────── │
│  └───┘ └───┘ └───┘        │  Subtotal              ₦12,500        │
│  ┌───┐ ┌───┐ ┌───┐        │  Discount        ₦ [      ] or %      │
│  │img│ │img│ │img│        │  VAT (7.5%)            ₦  938         │
│  │...│ │...│ │...│        │  Total                ₦13,438         │
│  └───┘ └───┘ └───┘        │                                        │
│                            │  Customer:  [Search or skip →]        │
│                            │                                        │
│                            │  [     Charge ₦13,438     ]          │
└────────────────────────────┴───────────────────────────────────────┘
```

**Mobile (375px):** Two-tab layout. Tab 1 = Products (grid). Tab 2 = Current Sale (order summary + charge button). Switching tabs is instant.

### 5.3 POS Screens

#### Screen POS-01 — Product Search & Selection

- Full-width search bar at top (autofocused on load, keyboard appears on mobile tap)
- Product grid: 3-col (tablet), 2-col (mobile)
- Tap product card → if single variant: adds directly to current sale
- Tap product card → if multiple variants: shows a bottom sheet variant picker
- Bottom sheet shows: variant options (color swatches, size buttons), quantity stepper, "Add to Sale" button

#### Screen POS-02 — Variant Picker (bottom sheet)

```
┌────────────────────────────────┐
│  Red T-Shirt                   │
│  ─────────────────────────────  │
│  Colour:   ● Red  ○ Blue       │
│  Size:     S  M  [L]  XL      │  ← selected = accent border
│  Price: ₦5,000  Stock: 12     │
│  Qty: [-] 1 [+]              │
│  [Add to Sale]                │
└────────────────────────────────┘
```

#### Screen POS-03 — Customer Lookup

Triggered when cashier taps the "Customer" field in the sale panel.

```
┌────────────────────────────────────────────┐
│  Find Customer                        ×    │
│  [Search name, phone, email...]            │
│  ────────────────────────────────────────  │
│  Amaka Obi   · 0801 234 5678              │  ← tap to select
│  John Eze    · 0702 111 2222              │
│  ────────────────────────────────────────  │
│  [+ Add New Customer]   [Skip — Walk-in]  │
└────────────────────────────────────────────┘
```

#### Screen POS-04 — Charge / Payment

Triggered when "Charge ₦X,XXX" is tapped.

```
┌─────────────────────────────────────────┐
│  Charge ₦13,438                    ×   │
│  ─────────────────────────────────────  │
│  Payment method:                        │
│                                         │
│  ┌───────────────────┐  ┌────────────┐ │
│  │  💳  Paystack     │  │ ✓  Manual  │ │
│  │   (card/transfer) │  │  (cash)    │ │
│  └───────────────────┘  └────────────┘ │
│                                         │
│  [Confirm & Charge]                     │
└─────────────────────────────────────────┘
```

**Paystack path:**
1. Creates order (`POST /v1/orders`) → confirms it (`POST /v1/orders/{id}/confirm`) → initiates payment (`POST /v1/payments/initiate`)
2. Generates a Paystack payment link
3. Shows QR code or sends link via SMS/WhatsApp to customer
4. Polls order payment status until paid
5. On success → Receipt screen

**Manual (cash) path:**
1. Creates order + confirms
2. Records manual payment
3. On confirmation → Receipt screen

#### Screen POS-05 — Payment Confirmation / Receipt

```
┌─────────────────────────────────────────┐
│                                         │
│       ✓  Payment Received               │
│          ₦13,438                        │
│                                         │
│   ORD-000042  ·  12 Jun 2026           │
│   Amaka Obi                             │
│                                         │
│   [📲 Send Receipt via WhatsApp]       │
│   [🖨️  Print Receipt]                  │
│   [New Sale]                            │
│                                         │
└─────────────────────────────────────────┘
```

Receipt content (for print/WhatsApp): business name + logo, order number, date, line items, totals, payment method, "Thank you" message.

#### Screen POS-06 — End of Day Summary

Accessed from the user avatar menu inside POS.

```
End of Day Summary
Date: 12 Jun 2026   Location: Main Store   Cashier: Amaka

Orders completed today:         24
Total revenue collected:   ₦312,500
  — via Paystack:           ₦245,000
  — Manual (cash):           ₦67,500

[Close Out & Return to Dashboard]
```

---

## 6. Surface 4 — WhatsApp Flow Reference

### 6.1 Overview

WhatsApp ordering is a conversational experience — not a screen-based UI. This section defines the message templates and conversation state machine so the backend chatbot developer can build the flow, and so the design contractor can create any visual onboarding or admin screens related to WhatsApp.

### 6.2 Conversation States

```
START
  └→ GREETING
      └→ BROWSE_CATEGORIES
          └→ BROWSE_PRODUCTS (by category)
              └→ VIEW_PRODUCT
                  └→ SELECT_VARIANT
                      └→ CART_REVIEW
                          ├→ ADD_MORE (returns to BROWSE_CATEGORIES)
                          └→ CHECKOUT
                              └→ COLLECT_CONTACT (name + phone confirm)
                                  └→ COLLECT_ADDRESS (or PICKUP selection)
                                      └→ GENERATE_PAYMENT_LINK
                                          └→ AWAIT_PAYMENT
                                              ├→ ORDER_CONFIRMED (on webhook success)
                                              └→ PAYMENT_FAILED (retry prompt)

STATUS_CHECK (anytime: "Track my order")
  └→ ORDER_STATUS_REPLY
```

### 6.3 Message Templates

**GREETING:**
```
👋 Hello [Name]! Welcome to [Business Name].

Here's what I can help you with:
1️⃣ Browse our products
2️⃣ Track an order
3️⃣ Speak to someone

Reply with a number to continue.
```

**BROWSE_CATEGORIES (list message / button):**
```
What are you shopping for today?

• Clothing
• Accessories
• Footwear
• All products
```

**VIEW_PRODUCT:**
```
*Red T-Shirt*
₦5,000

A premium cotton t-shirt available in 3 sizes.

Sizes available:
1. Small  (12 in stock)
2. Medium  (3 in stock)
3. Large  (0 in stock — out of stock)

Reply with a size number to add to cart.
```

**CART_REVIEW:**
```
🛒 *Your Cart*

2× Red T-Shirt / M — ₦10,000
1× Leather Belt / Black — ₦2,500

Subtotal: ₦12,500
VAT: ₦938
*Total: ₦13,438*

Reply:
1️⃣ Continue to checkout
2️⃣ Add more items
3️⃣ Clear cart
```

**PAYMENT_LINK:**
```
✅ Almost done! Pay securely here:

[Pay ₦13,438 →]
(link expires in 30 minutes)

Your order will be confirmed automatically once payment is received.
```

**ORDER_CONFIRMED:**
```
🎉 *Order Confirmed!*

Order: ORD-000042
Amount paid: ₦13,438

We'll get this ready for you shortly.
Reply "track" anytime to check your status.
```

### 6.4 WhatsApp Admin Screens (in Dashboard)

The merchant dashboard should include a **WhatsApp** settings panel (visible to owner only, feature gate: `whatsapp:ordering`):

```
WhatsApp Ordering

Status: ● Connected  (0801 000 0000)

Business greeting message: [editable textarea]
Out-of-hours message:       [editable textarea]

[Test conversation]   [Disconnect]
```

For merchants not on Growth/Enterprise: show locked state with upgrade prompt.

---

## 7. Mobile Responsiveness

### 7.1 Breakpoints

| Name | Width | Grid |
|------|-------|------|
| `mobile` | 0–767px | 4 columns, 16px gutter |
| `tablet` | 768–1279px | 8 columns, 24px gutter |
| `desktop` | 1280px+ | 12 columns, 32px gutter |

Max content width: 1440px. Center with auto margins above that.

### 7.2 Mobile-First Rules

- **Design mobile first**, then adapt upward. Start layout decisions at 375px.
- All tap targets: **minimum 44px** in height and width (Apple HIG standard). Use padding to achieve this even when visual size is smaller.
- Touch-safe spacing: at least 8px between adjacent interactive elements.
- Avoid hover-only interactions — all hover states must have an equivalent tap/focus state.

### 7.3 Surface-Specific Mobile Behaviour

**Customer Storefront:**
- Header: logo + search icon + cart icon. Search expands to full-width on tap.
- Product grid: 2-column at mobile, 3-column at tablet, 4-column at desktop.
- "Add to Cart" / "Checkout" CTA: sticky at bottom of screen as full-width button.
- Checkout: single-column form, large inputs (min height 48px).

**Merchant Dashboard:**
- Desktop: 240px collapsible sidebar.
- Tablet: 64px icon sidebar, hover/tap to expand as overlay.
- Mobile: hidden sidebar. Bottom tab bar with 5 items: Home / Orders / Products / Customers / More.
- "More" tab: opens a modal/sheet with: Finance, Staff, Locations, Subscriptions, Settings, Log out.
- Drawers (Order detail, Customer detail): full-screen on mobile, 480px from right on desktop.
- Tables on mobile: horizontally scrollable OR condensed to 2–3 columns with expand-on-tap.

**POS:**
- Designed tablet-first (768px landscape = ideal). Works on 375px portrait.
- Mobile: two-tab layout (Products / Current Sale). Single bottom tab toggle.
- All product cards: minimum 80px × 80px touch target.
- Keypad inputs (quantity, price): use `inputmode="numeric"` to trigger native numeric keyboard.

### 7.4 Progressive Enhancement

- Images: use `srcset` and `sizes`. Serve WebP/AVIF with JPEG fallback.
- Lazy load all images below the fold with `loading="lazy"` and a blurred placeholder.
- Fonts: use `font-display: swap` to prevent FOIT. Preload Inter weight 400 + 600.
- First load: target <2s Time to Interactive on a 3G connection (simulate with Chrome DevTools Slow 3G preset before shipping).

---

## 8. Nigerian Localization

### 8.1 Currency Formatting

All monetary values in the backend are stored as **kobo** (integers). The frontend must convert for display:

```
Display rule: (koboValue / 100).toLocaleString('en-NG', {
  style: 'currency',
  currency: 'NGN',
  minimumFractionDigits: 2
})

Result: ₦12,500.00

Shorthand for KPI widgets (amounts over ₦1M):
  ₦2.3M  — acceptable for dashboard cards, not for invoices/receipts/checkout
```

Never display floating-point intermediate values. All arithmetic stays in integers (kobo). Convert to display only at the render layer.

### 8.2 Phone Numbers

- Nigerian mobile numbers: 11 digits starting with 0 (e.g., 08012345678) or international format +234
- Input: accept both formats. Store and display consistently.
- Placeholder: `0801 234 5678`
- Validation: accept 11-digit numbers starting with `070|080|081|090|091`

### 8.3 Copy Tone

**Customer-facing (storefront + WhatsApp):** Warm and direct. Light Pidgin inflection on confirmation messages is acceptable and relatable.

```
✓ Casual (storefront):  "Your order is on its way!"
✓ Pidgin-light (WA):    "Your order don confirm! ✅"
✗ Corporate (avoid):    "Your transaction has been successfully processed."
```

**Management surfaces (dashboard + POS):** Professional English. No Pidgin. Operators need precision.

### 8.4 Payment Copy

- Reference Paystack by name where relevant. Nigerian merchants and customers recognize and trust it.
- Show Paystack logo on payment method screens.
- Payment success: show the Paystack reference code for reconciliation.

### 8.5 Low-Bandwidth UX

Nigerian mobile users frequently experience unstable or slow connections:

- **Skeleton loaders** on every async content area. Never show a blank white space while loading.
- **Offline detection:** Monitor `navigator.onLine`. Show a non-intrusive top banner: `"No internet connection — some features may be unavailable"`. Auto-dismiss on reconnect.
- **POS offline mode (recommended for Phase 2):** In Phase 1, if the cashier loses connection during a sale, show a clear error and prevent charge button activation.
- **Image optimization:** All product images should be ≤150KB at display resolution. Use Cloudflare R2's image transformation URLs if available.
- **Error states on payment:** Paystack timeout shows: "We couldn't reach the payment provider. Please try again or accept cash." — do not show raw error codes to customers.

### 8.6 NDPR Compliance

Nigeria Data Protection Regulation (NDPR) requires explicit consent for personal data processing.

**Customer storefront checkout:**
- Required checkbox: "I agree to my information being stored for order fulfilment. [Read our Privacy Policy]"
- Checkbox unchecked by default.
- Submission blocked if unchecked.
- Record `consentGivenAt` timestamp and `consentSource: "web_checkout"` with the customer record.

**POS — new customer creation:**
- Show a brief notice: "By saving this customer's details, you confirm they have consented to data storage."
- Record `consentSource: "pos_signup"`.

**WhatsApp:**
- Greeting message must include a brief data notice on first contact.
- Record `consentSource: "whatsapp_chat"`.

**Customer detail in dashboard:**
- Always surface NDPR consent status (date + source). If not recorded, show `⚠ Consent not recorded` in warning state.

### 8.7 Date & Time

- Format: `DD Mon YYYY` (e.g., `12 Jun 2026`) — avoid DD/MM/YYYY to prevent ambiguity.
- Time: 12-hour format with AM/PM (e.g., `2:30 PM`).
- Relative time for recency: "2 hours ago", "Yesterday" — acceptable in list tables.
- Absolute format on invoices, receipts, and legal documents.
- Timezone: WAT (West Africa Time, UTC+1). Display timezone label where relevant.

---

## 9. Role-Based UI Rules

The backend enforces RBAC on every API call. The frontend must also **hide or disable** actions the user cannot perform, to avoid confusing "access denied" errors.

### 9.1 What Each Role Sees

| UI Element | Owner | Manager | Staff | Viewer |
|---|---|---|---|---|
| Sidebar: Finance section | ✓ | ✓ | — | ✓ (read-only) |
| Sidebar: Staff | ✓ | — | — | — |
| Sidebar: Subscriptions | ✓ | — | — | — |
| Sidebar: Settings | ✓ | ✓ | — | — |
| Orders: [Confirm] button | ✓ | ✓ | — | — |
| Orders: [Refund] button | ✓ | ✓ | — | — |
| Products: Cost column | ✓ | ✓ | — | — |
| Products: [Edit] / [Add] | ✓ | ✓ | — | — |
| Inventory: [Adjust] | ✓ | ✓ | — | — |
| Customers: [Edit] | ✓ | ✓ | ✓ | — |
| Top bar: Switch to POS | ✓ | ✓ | ✓ | — |

### 9.2 Implementation Pattern

- Read the user's role from `GET /v1/auth/me` → `role` field on login.
- Store role in app state / context.
- Use a `<Guard role={['owner', 'manager']}>` wrapper component that renders `null` (not "Access Denied") when the role doesn't match — hidden, not blocked.
- Exception: Finance for Viewer — render the section but with all action buttons removed and data read-only.

### 9.3 Feature Gate Overlay

When a user's plan does not include a feature (e.g., trial user tries to access P&L):

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│   🔒  This feature is on the Entry plan and above.      │
│                                                          │
│   P&L reports give you a real-time view of your          │
│   business profit and margins.                           │
│                                                          │
│               [Upgrade to Entry — ₦3,500/mo]            │
│                    [Maybe later]                         │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

Show this as a modal/overlay on the feature page, not a redirect. The underlying page can be blurred behind it. This makes the value of upgrading tangible.

---

## 10. API Surface Map

Reference for the contractor: which API endpoints back each screen.

| Surface | Screen | Method | Endpoint |
|---------|--------|--------|----------|
| Auth | Login | POST | `/v1/auth/login` |
| Auth | Session restore | GET | `/v1/auth/me` |
| Auth | Logout | POST | `/v1/auth/logout` |
| Storefront | Product catalogue | GET | `/v1/products?isActive=true&categoryId={id}&search={q}` |
| Storefront | Product detail | GET | `/v1/products/{id}` |
| Storefront | Categories | GET | `/v1/products/categories` |
| Storefront | Create order | POST | `/v1/orders` |
| Storefront | Create customer | POST | `/v1/customers` |
| Storefront | Initiate payment | POST | `/v1/payments/initiate` |
| Storefront | Order status | GET | `/v1/orders/{id}` |
| Dashboard | Orders list | GET | `/v1/orders?status={s}&channel={c}&startDate={d}&endDate={d}` |
| Dashboard | Order detail | GET | `/v1/orders/{id}` |
| Dashboard | Confirm order | POST | `/v1/orders/{id}/confirm` |
| Dashboard | Process order | POST | `/v1/orders/{id}/process` |
| Dashboard | Fulfil order | POST | `/v1/orders/{id}/fulfil` |
| Dashboard | Cancel order | POST | `/v1/orders/{id}/cancel` |
| Dashboard | Products list | GET | `/v1/products` |
| Dashboard | Create product | POST | `/v1/products` |
| Dashboard | Update product | PATCH | `/v1/products/{id}` |
| Dashboard | Add variant | POST | `/v1/products/{id}/variants` |
| Dashboard | Update variant | PATCH | `/v1/products/{id}/variants/{vid}` |
| Dashboard | Inventory levels | GET | `/v1/inventory?locationId={id}` |
| Dashboard | Receive stock | POST | `/v1/inventory/receive` |
| Dashboard | Adjust stock | POST | `/v1/inventory/adjust` |
| Dashboard | Stock movements | GET | `/v1/inventory/movements` |
| Dashboard | Low-stock alert | GET | `/v1/inventory/low-stock` |
| Dashboard | Customers list | GET | `/v1/customers?search={q}` |
| Dashboard | Customer detail | GET | `/v1/customers/{id}` |
| Dashboard | Create customer | POST | `/v1/customers` |
| Dashboard | Update customer | PATCH | `/v1/customers/{id}` |
| Dashboard | Wallet balance | GET | `/v1/ledger/wallet` |
| Dashboard | Account balances | GET | `/v1/ledger/balances` |
| Dashboard | Journal entries | GET | `/v1/ledger/entries` |
| Dashboard | Chart of accounts | GET | `/v1/ledger/accounts` |
| POS | (reuses Orders, Products, Customers, Payments endpoints above) | | |
| Onboarding | Provision tenant | POST | `/v1/tenants` |

---

## Appendix A — Recommended Tech Stack (Frontend)

This is a suggestion, not a constraint. The contractor may use their preferred stack as long as it meets the performance and localization requirements above.

| Concern | Recommendation |
|---------|---------------|
| Framework | Next.js 14+ (App Router) for SSR on storefront; or Vite + React SPA for dashboard + POS |
| Styling | Tailwind CSS — maps cleanly to the token system above |
| Component base | shadcn/ui — headless, accessible, easily customized to this design language |
| State management | Zustand (lightweight) or React Query + Context |
| Charts (P&L) | Recharts or Tremor |
| Icons | Lucide React |
| Date utils | date-fns (locale: `en-NG`) |
| Currency utils | `Intl.NumberFormat` with `en-NG` locale |
| HTTP client | Axios or native fetch with React Query |
| Auth | JWT stored in `httpOnly` cookie (secure) or memory + refresh token in cookie |

---

## Appendix B — Out of Scope (Phase 2+)

Do not design or build screens for the following in Phase 1:

- Loyalty points / rewards system
- Virtual bank accounts
- Multi-currency (USD, GBP) — NGN only
- Gift cards
- Wholesale / B2B pricing tiers
- Advanced analytics beyond P&L (cohort analysis, LTV, etc.)
- FIRS tax filing integration
- Floating wallet at scale

If any of these appear as requests during build, reference the execution plan and flag them as Phase 2 scope.

---

*This document was generated from the Phase 1 backend implementation (Stages 0–2 complete as of June 2026). Update it as the API evolves. The Swagger UI at `/documentation` is the authoritative API reference for request/response shapes.*
