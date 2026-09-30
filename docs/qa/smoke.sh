#!/usr/bin/env bash
#
# QA smoke test — end-to-end merchant journey against a running BPOS server.
#
#   Usage:  BASE=https://<qa-host> \
#           MERCHANT_SLUG=<slug> MERCHANT_EMAIL=<email> MERCHANT_PASSWORD=<password> \
#           ./docs/qa/smoke.sh
#
#   BASE is required. The MERCHANT_* variables are the owner login of a
#   growth-plan merchant; without them phase 3 is skipped and the run covers
#   signup, auth and the trial-plan gates only.
#
# Phase 1  health, public signup, auth (positive + negative)
# Phase 2  trial-plan feature gates on the brand-new merchant
# Phase 3  full journey on the growth-plan merchant: catalogue, stock, customer,
#          order lifecycle, invoice, ledger, reporting, CSV export, audit trail
# Phase 4  cross-cutting: plane separation, logout, refresh revocation
#
# Requires curl + jq. Exits non-zero if any expectation failed.
set -uo pipefail

if [ -z "${BASE:-}" ]; then
  echo "BASE is required, e.g. BASE=https://qa.example.com ./docs/qa/smoke.sh" >&2
  exit 1
fi
SEED_SLUG="${MERCHANT_SLUG:-}"
SEED_EMAIL="${MERCHANT_EMAIL:-}"
SEED_PASSWORD="${MERCHANT_PASSWORD:-}"

SLUG="qa-smoke-$(date +%s)"
EMAIL="owner@${SLUG}.ng"
PASSWORD="QASmokePass1!"
PASS=0; FAIL=0; SKIP=0

c()    { printf '\033[%sm%s\033[0m' "$1" "$2"; }
ok()   { PASS=$((PASS+1)); echo "  $(c '0;32' 'PASS')  $1"; }
bad()  { FAIL=$((FAIL+1)); echo "  $(c '0;31' 'FAIL')  $1"; echo "        body: ${BODY_OUT:0:400}"; }
skip() { SKIP=$((SKIP+1)); echo "  $(c '0;33' 'SKIP')  $1"; }
note() { echo "        $1"; }
step() { echo; echo "$(c '1;36' "── $1")"; }

# call <METHOD> <PATH> [BODY] [TOKEN]  ->  $STATUS, $BODY_OUT
call() {
  local method="$1" path="$2" body="${3:-}" token="${4:-}"
  local args=(-sS -o /tmp/qa-smoke-body -w '%{http_code}' -X "$method" "${BASE}${path}")
  [ -n "$token" ] && args+=(-H "authorization: Bearer ${token}")
  [ -n "$body" ] && args+=(-H 'content-type: application/json' --data-raw "$body")
  STATUS="$(curl "${args[@]}")"
  BODY_OUT="$(cat /tmp/qa-smoke-body)"
}
expect() { if [ "$STATUS" = "$1" ]; then ok "$2 ($STATUS)"; else bad "$2 — expected $1, got $STATUS"; fi; }
jqv()    { echo "$BODY_OUT" | jq -r "$1" 2>/dev/null; }

command -v jq >/dev/null || { echo "jq is required"; exit 1; }
echo "$(c '1;37' "BPOS QA smoke — ${BASE}")"

# ── Phase 1 ───────────────────────────────────────────────────────────────────
step "1. Health"
call GET /health
case "$STATUS" in
  200|503) ok "health reachable ($STATUS), status=$(jqv '.status')"; note "db=$(jqv '.checks.database.status // .checks.database // "?"') redis=$(jqv '.checks.redis.status // .checks.redis // "?"')" ;;
  *) bad "health unreachable ($STATUS)"; exit 1 ;;
esac

step "2. Public signup"
call POST /v1/tenants "{\"name\":\"QA Smoke Store\",\"slug\":\"${SLUG}\",\"businessEmail\":\"${EMAIL}\",\"ownerFirstName\":\"Ada\",\"ownerLastName\":\"Obi\",\"ownerPassword\":\"${PASSWORD}\"}"
expect 201 "tenant provisioned (${SLUG})"
TENANT_ID="$(jqv '.data.tenantId')"

call POST /v1/tenants "{\"name\":\"QA Dupe\",\"slug\":\"${SLUG}\",\"businessEmail\":\"dupe@${SLUG}.ng\",\"ownerFirstName\":\"A\",\"ownerLastName\":\"B\",\"ownerPassword\":\"${PASSWORD}\"}"
expect 409 "duplicate slug rejected"

call POST /v1/tenants "{\"name\":\"QA Bad Slug\",\"slug\":\"Not A Slug\",\"businessEmail\":\"bad@x.ng\",\"ownerFirstName\":\"A\",\"ownerLastName\":\"B\",\"ownerPassword\":\"${PASSWORD}\"}"
expect 400 "invalid slug rejected"

call POST /v1/tenants "{\"name\":\"QA Extra\",\"slug\":\"qa-extra-$$\",\"businessEmail\":\"x@x.ng\",\"ownerFirstName\":\"A\",\"ownerLastName\":\"B\",\"ownerPassword\":\"${PASSWORD}\",\"planTier\":\"enterprise\"}"
expect 400 "unknown field rejected (strict schema — no plan self-assignment)"

step "3. Auth"
call POST /v1/auth/login "{\"tenantSlug\":\"${SLUG}\",\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}"
expect 200 "login"
TRIAL_TOKEN="$(jqv '.data.accessToken')"
TRIAL_REFRESH="$(jqv '.data.refreshToken')"

call POST /v1/auth/login "{\"tenantSlug\":\"${SLUG}\",\"email\":\"${EMAIL}\",\"password\":\"WrongPassword1!\"}"
expect 401 "wrong password rejected"

if [ -n "$SEED_SLUG" ]; then
  call POST /v1/auth/login "{\"tenantSlug\":\"${SEED_SLUG}\",\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}"
  expect 401 "credentials do not work against another merchant's slug"
fi

call GET /v1/auth/me "" "$TRIAL_TOKEN"; expect 200 "GET /auth/me"
call GET /v1/auth/me;                    expect 401 "GET /auth/me without a token"
call GET /v1/auth/me "" "garbage.token.value"; expect 401 "GET /auth/me with a forged token"

# ── Phase 2 ───────────────────────────────────────────────────────────────────
step "4. Trial-plan feature gates (expect 402 FEATURE_GATED)"
for probe in "GET|/v1/locations|locations:manage" "GET|/v1/staff|staff:invite" "GET|/v1/reports/pl?from=2026-01-01T00:00:00.000Z&to=2026-12-31T00:00:00.000Z|reporting:pl" "GET|/v1/expenses|expenses:track" "GET|/v1/inventory/low-stock|inventory:alerts"; do
  IFS='|' read -r m p feat <<<"$probe"
  call "$m" "$p" "" "$TRIAL_TOKEN"
  if [ "$STATUS" = "402" ]; then ok "$feat gated on trial (402, code=$(jqv '.error.code'))"; else bad "$feat should be 402 on trial, got $STATUS"; fi
done
call GET /v1/inventory "" "$TRIAL_TOKEN";    expect 200 "inventory:track allowed on trial"
call GET /v1/ledger/accounts "" "$TRIAL_TOKEN"; expect 200 "ledger:view allowed on trial"
call GET /v1/onboarding "" "$TRIAL_TOKEN";   expect 200 "onboarding checklist ($(jqv '.data.percentComplete')% complete)"

# ── Phase 3 ───────────────────────────────────────────────────────────────────
step "5. Growth-plan journey${SEED_SLUG:+ (${SEED_SLUG})}"
if [ -z "$SEED_SLUG" ] || [ -z "$SEED_EMAIL" ] || [ -z "$SEED_PASSWORD" ]; then
  skip "set MERCHANT_SLUG, MERCHANT_EMAIL and MERCHANT_PASSWORD to run phase 3"
  TOKEN=""
else
  call POST /v1/auth/login "{\"tenantSlug\":\"${SEED_SLUG}\",\"email\":\"${SEED_EMAIL}\",\"password\":\"${SEED_PASSWORD}\"}"
  if [ "$STATUS" != "200" ]; then
    skip "growth-plan merchant login failed ($STATUS) — check the credentials you were given"
    TOKEN=""
  else
    ok "growth-plan owner login"
    TOKEN="$(jqv '.data.accessToken')"
  fi
fi

if [ -n "$TOKEN" ]; then
  call GET /v1/locations "" "$TOKEN"; expect 200 "locations listed"
  LOCATION_ID="$(jqv '.data[0].id')"
  note "location: $LOCATION_ID"

  call POST /v1/products/categories '{"name":"QA Smoke Category"}' "$TOKEN"
  expect 201 "category created"; CATEGORY_ID="$(jqv '.data.id')"

  call POST /v1/products "{\"name\":\"QA Smoke Product\",\"categoryId\":\"${CATEGORY_ID}\"}" "$TOKEN"
  expect 201 "product created"; PRODUCT_ID="$(jqv '.data.id')"

  SKU="QA-SMOKE-$(date +%s)"
  call POST "/v1/products/${PRODUCT_ID}/variants" "{\"sku\":\"${SKU}\",\"name\":\"Default\",\"priceKobo\":2500000,\"costKobo\":1800000,\"taxRateBps\":750}" "$TOKEN"
  expect 201 "variant created"; VARIANT_ID="$(jqv '.data.id')"

  call POST "/v1/products/${PRODUCT_ID}/variants" "{\"sku\":\"${SKU}\",\"name\":\"Dupe\",\"priceKobo\":2500000}" "$TOKEN"
  expect 409 "duplicate SKU rejected"

  call POST "/v1/products/${PRODUCT_ID}/variants" '{"sku":"QA-SMOKE-NEG","name":"Neg","priceKobo":-1}' "$TOKEN"
  expect 400 "negative price rejected"

  call POST /v1/inventory/receive "{\"variantId\":\"${VARIANT_ID}\",\"locationId\":\"${LOCATION_ID}\",\"quantity\":10,\"note\":\"QA smoke opening stock\"}" "$TOKEN"
  expect 201 "stock received (+10)"

  call POST /v1/inventory/adjust "{\"variantId\":\"${VARIANT_ID}\",\"locationId\":\"${LOCATION_ID}\",\"quantity\":-2,\"note\":\"QA smoke write-off\"}" "$TOKEN"
  expect 201 "stock adjusted (-2)"

  call GET "/v1/inventory?variantId=${VARIANT_ID}" "" "$TOKEN"
  expect 200 "inventory read back — quantityOnHand=$(jqv '.data[0].quantityOnHand') (expect 8)"

  call POST /v1/customers '{"firstName":"Chidinma","lastName":"Eze","email":"chidinma.qa@example.ng","phone":"+2348031234567"}' "$TOKEN"
  expect 201 "customer created"; CUSTOMER_ID="$(jqv '.data.id')"

  call POST /v1/orders "{\"customerId\":\"${CUSTOMER_ID}\",\"locationId\":\"${LOCATION_ID}\",\"channel\":\"pos\",\"items\":[{\"variantId\":\"${VARIANT_ID}\",\"quantity\":2,\"unitPriceKobo\":2500000}]}" "$TOKEN"
  expect 201 "draft order created — totalKobo=$(jqv '.data.totalKobo')"; ORDER_ID="$(jqv '.data.id')"

  call POST /v1/orders '{"channel":"pos","items":[]}' "$TOKEN"; expect 400 "order with no items rejected"
  call POST "/v1/orders/${ORDER_ID}/fulfil" "" "$TOKEN"; expect 400 "draft cannot jump to fulfilled"
  call POST "/v1/orders/${ORDER_ID}/confirm" "" "$TOKEN"; expect 200 "order confirmed"

  call GET "/v1/inventory?variantId=${VARIANT_ID}" "" "$TOKEN"
  Q="$(jqv '.data[0].quantityOnHand')"
  if [ "$Q" = "6" ]; then ok "stock deducted on confirm (8 -> 6)"; else bad "stock after confirm should be 6, got $Q"; fi

  call POST "/v1/orders/${ORDER_ID}/process" "" "$TOKEN"; expect 200 "order processing"
  call POST "/v1/orders/${ORDER_ID}/fulfil" "" "$TOKEN";  expect 200 "order fulfilled"
  call POST "/v1/orders/${ORDER_ID}/cancel" "" "$TOKEN";  expect 400 "fulfilled order cannot be cancelled"

  call POST /v1/invoices "{\"orderId\":\"${ORDER_ID}\"}" "$TOKEN"
  expect 201 "invoice generated"; INVOICE_ID="$(jqv '.data.id')"; note "invoice: ${INVOICE_ID}"

  call GET "/v1/ledger/entries?referenceType=order&referenceId=${ORDER_ID}" "" "$TOKEN"
  expect 200 "journal entries posted for the order"

  call GET /v1/ledger/balances "" "$TOKEN"; expect 200 "account balances"
  call GET /v1/ledger/wallet "" "$TOKEN";   expect 200 "wallet balance"

  FROM="$(date -u -v-30d +%Y-%m-%dT00:00:00.000Z 2>/dev/null || date -u -d '30 days ago' +%Y-%m-%dT00:00:00.000Z)"
  TO="$(date -u +%Y-%m-%dT23:59:59.000Z)"
  call GET "/v1/reports/pl?from=${FROM}&to=${TO}" "" "$TOKEN";                expect 200 "P&L report"
  call GET "/v1/reports/pl" "" "$TOKEN";                                       expect 400 "P&L without a date range rejected"
  call GET "/v1/reports/best-sellers?limit=5" "" "$TOKEN";                     expect 200 "best sellers"
  call GET "/v1/reports/revenue-by-location?from=${FROM}&to=${TO}" "" "$TOKEN"; expect 200 "revenue by location (growth-only feature)"
  call GET "/v1/reports/staff-sales?from=${FROM}&to=${TO}" "" "$TOKEN";        expect 200 "staff sales"
  call GET "/v1/reports/inventory-valuation?format=json" "" "$TOKEN";          expect 200 "inventory valuation"

  CSV_CT="$(curl -sS -o /dev/null -D - -w '' -H "authorization: Bearer ${TOKEN}" "${BASE}/v1/reports/pl/export?from=${FROM}&to=${TO}" | tr -d '\r' | awk -F': ' 'tolower($1)=="content-type"{print $2}')"
  case "$CSV_CT" in text/csv*) ok "P&L CSV export returns text/csv" ;; *) BODY_OUT="content-type: ${CSV_CT}"; bad "P&L CSV export content-type" ;; esac

  call GET "/v1/shipping/states" "" "$TOKEN"
  expect 200 "Nigerian states list ($(echo "$BODY_OUT" | jq -r '.data | length' 2>/dev/null) entries)"

  call GET /v1/settings/audit "" "$TOKEN";                  expect 200 "activity trail (owner)"
  call GET "/v1/settings/audit?actorType=platform" "" "$TOKEN"; expect 200 "activity trail filtered to BPOS staff access"
  call GET "/v1/settings/audit?actorType=robot" "" "$TOKEN";    expect 400 "invalid actorType rejected"
fi

# ── Phase 4 ───────────────────────────────────────────────────────────────────
step "6. Plane separation + session teardown"
call GET /v1/platform/tenants "" "${TOKEN:-$TRIAL_TOKEN}"
case "$STATUS" in
  404) ok "platform plane not mounted here (JWT_PLATFORM_SECRET unset) — 404" ;;
  401) ok "merchant token rejected by the platform plane (401)" ;;
  *)   bad "merchant token reached the platform plane — expected 401 or 404, got $STATUS" ;;
esac

call GET "/v1/orders/00000000-0000-0000-0000-000000000000" "" "${TOKEN:-$TRIAL_TOKEN}"
expect 404 "unknown order id returns 404, not 500"

call POST /v1/auth/logout "{\"refreshToken\":\"${TRIAL_REFRESH}\"}" "$TRIAL_TOKEN"; expect 200 "logout"
call POST /v1/auth/refresh "{\"tenantSlug\":\"${SLUG}\",\"refreshToken\":\"${TRIAL_REFRESH}\"}"; expect 401 "revoked refresh token rejected"

echo
echo "$(c '1;36' '── Summary')"
echo "  new tenant : ${SLUG}  (${TENANT_ID:-n/a})"
echo "  passed     : $(c '0;32' "$PASS")   failed: $(c '0;31' "$FAIL")   skipped: $(c '0;33' "$SKIP")"
echo
[ "$FAIL" -eq 0 ]
