import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { getTestApp, closeTestApp } from '../helpers/app.js';
import type { FastifyInstance } from 'fastify';

// ─── Mock service and middleware ──────────────────────────────────────────────

vi.mock('../../src/modules/products/service.js', () => ({
  createCategory: vi.fn().mockResolvedValue({ id: 'cat-1', name: 'Electronics', parentId: null }),
  listCategories: vi.fn().mockResolvedValue([]),
  createProduct: vi.fn().mockResolvedValue({
    id: 'prod-1',
    name: 'Test Product',
    description: null,
    categoryId: null,
    imageUrl: null,
    isActive: true,
    hasVariants: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }),
  listProducts: vi.fn().mockResolvedValue({
    items: [],
    total: 0,
    page: 1,
    limit: 20,
    totalPages: 0,
  }),
  getProduct: vi.fn().mockResolvedValue({
    id: 'prod-1',
    name: 'Test Product',
    description: null,
    categoryId: null,
    imageUrl: null,
    isActive: true,
    hasVariants: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    variants: [
      {
        id: 'var-1',
        productId: 'prod-1',
        sku: 'SKU-001',
        name: 'Default',
        priceKobo: 50000,
        costKobo: 25000,
        taxRateBps: 750,
        attributes: null,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
  }),
  updateProduct: vi.fn().mockResolvedValue({
    id: 'prod-1',
    name: 'Updated Product',
    isActive: true,
    hasVariants: false,
    description: null,
    categoryId: null,
    imageUrl: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }),
  createVariant: vi.fn().mockResolvedValue({ id: 'var-1', sku: 'SKU-001', name: 'Default' }),
  updateVariant: vi.fn().mockResolvedValue({ id: 'var-1', sku: 'SKU-001', name: 'Updated' }),
}));

vi.mock('../../src/shared/middleware/tenant.js', () => ({
  resolveTenant: vi.fn(async (request: { tenant: { tenantId: string; schema: string } }) => {
    request.tenant = { tenantId: 'tenant-test', schema: 'test_schema' };
  }),
}));

vi.mock('../../src/shared/middleware/feature-gate.js', () => ({
  requireFeature: vi.fn(() =>
    vi.fn(async () => {
      // no-op: all features allowed in tests
    }),
  ),
}));

// ─── Test helpers ─────────────────────────────────────────────────────────────

let app: FastifyInstance;
let bearerToken: string;
let staffToken: string;

beforeAll(async () => {
  app = await getTestApp();
  bearerToken = app.jwt.sign({
    sub: 'user-test',
    tid: 'tenant-test',
    role: 'owner',
    email: 'owner@test.com',
    type: 'access',
  });
  staffToken = app.jwt.sign({
    sub: 'staff-test',
    tid: 'tenant-test',
    role: 'staff',
    email: 'staff@test.com',
    type: 'access',
  });
});

afterAll(async () => {
  await closeTestApp();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Products API', () => {
  it('POST /v1/products returns 201 with product id', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/products',
      headers: { Authorization: `Bearer ${bearerToken}` },
      payload: { name: 'Test Product' },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json<{ success: boolean; data: { id: string } }>();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe('prod-1');
  });

  it('POST /v1/products returns 400 for missing name', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/products',
      headers: { Authorization: `Bearer ${bearerToken}` },
      payload: { description: 'No name provided' },
    });

    expect(response.statusCode).toBe(400);
  });

  it('GET /v1/products/:id returns product with variants', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/products/prod-1',
      headers: { Authorization: `Bearer ${bearerToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ success: boolean; data: { id: string; variants: unknown[] } }>();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe('prod-1');
    expect(Array.isArray(body.data.variants)).toBe(true);
    expect(body.data.variants).toHaveLength(1);
  });

  it('PATCH /v1/products/:id returns updated product', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/v1/products/prod-1',
      headers: { Authorization: `Bearer ${bearerToken}` },
      payload: { name: 'Updated Product' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ success: boolean; data: { name: string } }>();
    expect(body.success).toBe(true);
    expect(body.data.name).toBe('Updated Product');
  });

  it('POST /v1/products/:id/variants returns 201', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/products/prod-1/variants',
      headers: { Authorization: `Bearer ${bearerToken}` },
      payload: { sku: 'SKU-001', name: 'Default', priceKobo: 50000 },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json<{ success: boolean; data: { id: string } }>();
    expect(body.success).toBe(true);
  });

  it('POST /v1/products/:id/variants returns 400 for missing required fields', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/products/prod-1/variants',
      headers: { Authorization: `Bearer ${bearerToken}` },
      payload: { name: 'Missing SKU and price' },
    });

    expect(response.statusCode).toBe(400);
  });

  it('GET /v1/products requires authentication', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/products',
    });

    expect(response.statusCode).toBe(401);
  });

  it('GET /v1/products/:id — owner sees costKobo on variants', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/products/prod-1',
      headers: { Authorization: `Bearer ${bearerToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ data: { variants: Array<Record<string, unknown>> } }>();
    const variant = body.data.variants[0]!;
    expect(variant).toHaveProperty('costKobo');
    expect(variant['costKobo']).toBe(25000);
  });

  it('GET /v1/products/:id — staff does NOT see costKobo on variants', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/products/prod-1',
      headers: { Authorization: `Bearer ${staffToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ data: { variants: Array<Record<string, unknown>> } }>();
    const variant = body.data.variants[0]!;
    expect(variant).not.toHaveProperty('costKobo');
    // Staff can still see sales price and tax rate
    expect(variant['priceKobo']).toBe(50000);
    expect(variant['taxRateBps']).toBe(750);
  });
});
