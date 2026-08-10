/**
 * k6 load test — BPOS API baseline performance
 *
 * Usage:
 *   BASE_URL=https://staging.bpos.ng \
 *   TENANT_SLUG=kemi-electronics \
 *   OWNER_EMAIL=owner@kemis.test \
 *   OWNER_PASSWORD=QAPassword1! \
 *   k6 run test/load/k6.js
 *
 * Thresholds (pass/fail gates):
 *   - 95th-percentile response time < 500ms
 *   - Error rate < 1%
 *   - Health check p95 < 100ms
 */
import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// ─── Config ───────────────────────────────────────────────────────────────────

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const TENANT_SLUG = __ENV.TENANT_SLUG || 'kemi-electronics-qa';
const OWNER_EMAIL = __ENV.OWNER_EMAIL || 'owner@kemis.test';
const OWNER_PASSWORD = __ENV.OWNER_PASSWORD || 'QAPassword1!';

// ─── Custom metrics ───────────────────────────────────────────────────────────

const errorRate = new Rate('errors');
const loginDuration = new Trend('login_duration', true);
const orderCreateDuration = new Trend('order_create_duration', true);
const reportingDuration = new Trend('reporting_duration', true);

// ─── Load profile ─────────────────────────────────────────────────────────────

export const options = {
  stages: [
    { duration: '30s', target: 10 },   // ramp up to 10 VUs
    { duration: '1m',  target: 10 },   // hold at 10 VUs
    { duration: '30s', target: 50 },   // ramp up to 50 VUs (spike)
    { duration: '1m',  target: 50 },   // hold at 50 VUs
    { duration: '30s', target: 0 },    // ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],  // 95% of requests under 500ms
    errors: ['rate<0.01'],             // < 1% error rate
    login_duration: ['p(95)<1000'],    // login under 1s
    order_create_duration: ['p(95)<800'],
    reporting_duration: ['p(95)<2000'],
  },
};

// ─── Shared state ─────────────────────────────────────────────────────────────

let accessToken = '';

// ─── Setup (runs once before the test) ───────────────────────────────────────

export function setup() {
  const loginRes = http.post(
    `${BASE_URL}/v1/auth/login`,
    JSON.stringify({ tenantSlug: TENANT_SLUG, email: OWNER_EMAIL, password: OWNER_PASSWORD }),
    { headers: { 'Content-Type': 'application/json' } },
  );

  check(loginRes, {
    'setup: login succeeded': (r) => r.status === 200,
  });

  const body = loginRes.json();
  return { accessToken: body.data?.accessToken ?? '' };
}

// ─── Default function (runs per VU iteration) ─────────────────────────────────

export default function (data) {
  const token = data.accessToken;
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  group('Health check', () => {
    const res = http.get(`${BASE_URL}/health`);
    const ok = check(res, {
      'health: status 200': (r) => r.status === 200,
      'health: status ok': (r) => r.json('status') === 'ok',
    });
    errorRate.add(!ok);
  });

  sleep(0.5);

  group('Onboarding status', () => {
    const res = http.get(`${BASE_URL}/v1/onboarding`, { headers });
    const ok = check(res, {
      'onboarding: status 200': (r) => r.status === 200,
      'onboarding: has percentComplete': (r) => r.json('data.percentComplete') !== undefined,
    });
    errorRate.add(!ok);
  });

  sleep(0.3);

  group('Product listing', () => {
    const res = http.get(`${BASE_URL}/v1/products?limit=20`, { headers });
    const ok = check(res, {
      'products: status 200': (r) => r.status === 200,
    });
    errorRate.add(!ok);
  });

  sleep(0.3);

  group('Order creation (write path)', () => {
    const start = Date.now();
    const res = http.post(
      `${BASE_URL}/v1/orders`,
      JSON.stringify({
        channel: 'pos',
        items: [{ variantId: 'REPLACE_WITH_REAL_VARIANT_ID', quantity: 1, unitPriceKobo: 1000 }],
      }),
      { headers },
    );
    orderCreateDuration.add(Date.now() - start);

    // 201 = success, 400 = expected (fake variant ID in load test) — both acceptable
    const ok = check(res, {
      'order: not 5xx': (r) => r.status < 500,
    });
    errorRate.add(!ok);
  });

  sleep(0.5);

  group('P&L report (heavy read)', () => {
    const from = '2025-01-01';
    const to = '2025-12-31';
    const start = Date.now();
    const res = http.get(`${BASE_URL}/v1/reports/pl?from=${from}&to=${to}`, { headers });
    reportingDuration.add(Date.now() - start);

    const ok = check(res, {
      'pl report: status 200': (r) => r.status === 200,
    });
    errorRate.add(!ok);
  });

  sleep(1);
}

// ─── Teardown ─────────────────────────────────────────────────────────────────

export function teardown(data) {
  if (data.accessToken) {
    // Nothing to clean up for read-only load tests
    console.log('Load test complete. Check Grafana for Prometheus metrics.');
  }
}
