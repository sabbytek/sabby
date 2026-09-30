import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import sharp from 'sharp';
import { getTestApp, closeTestApp } from '../helpers/app.js';
import type { FastifyInstance } from 'fastify';

// ─── Mock service and middleware ──────────────────────────────────────────────

vi.mock('../../src/shared/storage/r2.js', () => ({
  uploadToR2: vi.fn().mockResolvedValue('https://test.r2.example.com/test_schema/uploads/fake.jpg'),
  uploadPrivateToR2: vi.fn().mockResolvedValue(undefined),
  signR2Url: vi.fn(async (key: string) => `https://signed.r2.example.com/${key}?X-Amz-Signature=x`),
}));

vi.mock('../../src/shared/middleware/tenant.js', () => ({
  resolveTenant: vi.fn(async (request: { tenant: { tenantId: string; schema: string } }) => {
    request.tenant = { tenantId: 'tenant-test', schema: 'test_schema' };
  }),
}));

// ─── Test helpers ─────────────────────────────────────────────────────────────

function buildMultipartPayload(fileBuffer: Buffer, filename: string, mimeType: string) {
  const boundary = '----bposTestBoundary';
  const payload = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`,
    ),
    fileBuffer,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { boundary, payload };
}

let app: FastifyInstance;
let bearerToken: string;

beforeAll(async () => {
  app = await getTestApp();
  bearerToken = app.jwt.sign({
    sub: 'user-test',
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

describe('Uploads API', () => {
  it('POST /v1/uploads/image compresses and uploads a valid image', async () => {
    const source = await sharp({
      create: { width: 2000, height: 2000, channels: 3, background: 'red' },
    })
      .jpeg()
      .toBuffer();
    const { boundary, payload } = buildMultipartPayload(source, 'photo.jpg', 'image/jpeg');

    const { uploadToR2 } = await import('../../src/shared/storage/r2.js');

    const response = await app.inject({
      method: 'POST',
      url: '/v1/uploads/image',
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload,
    });

    expect(response.statusCode).toBe(201);
    const body = response.json<{ success: boolean; data: { url: string } }>();
    expect(body.success).toBe(true);
    expect(body.data.url).toBe('https://test.r2.example.com/test_schema/uploads/fake.jpg');

    expect(uploadToR2).toHaveBeenCalledWith(expect.objectContaining({ contentType: 'image/jpeg' }));
    const call = vi.mocked(uploadToR2).mock.calls.at(-1)!;
    const uploadedBody = call[0].body;
    expect(uploadedBody.length).toBeLessThan(source.length);
  });

  it('POST /v1/uploads/image?visibility=private stores privately and returns ref + signed url', async () => {
    const source = await sharp({
      create: { width: 400, height: 400, channels: 3, background: 'blue' },
    })
      .jpeg()
      .toBuffer();
    const { boundary, payload } = buildMultipartPayload(source, 'receipt.jpg', 'image/jpeg');

    const { uploadToR2, uploadPrivateToR2 } = await import('../../src/shared/storage/r2.js');
    vi.mocked(uploadToR2).mockClear();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/uploads/image?visibility=private',
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload,
    });

    expect(response.statusCode).toBe(201);
    const { data } = response.json<{ data: { url: string; ref: string } }>();
    expect(data.ref).toMatch(/^r2:\/\/test_schema\/receipts\/[0-9a-f-]+\.\w+$/);
    expect(data.url).toBe(`https://signed.r2.example.com/${data.ref.slice('r2://'.length)}?X-Amz-Signature=x`);
    expect(uploadPrivateToR2).toHaveBeenCalledTimes(1);
    expect(uploadToR2).not.toHaveBeenCalled();
  });

  it('POST /v1/uploads/image rejects an unknown visibility', async () => {
    const { boundary, payload } = buildMultipartPayload(Buffer.from('x'), 'a.jpg', 'image/jpeg');
    const response = await app.inject({
      method: 'POST',
      url: '/v1/uploads/image?visibility=secret',
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload,
    });
    expect(response.statusCode).toBe(400);
  });

  it('POST /v1/uploads/image rejects an unsupported mime type', async () => {
    const { boundary, payload } = buildMultipartPayload(
      Buffer.from('not an image'),
      'notes.txt',
      'text/plain',
    );

    const response = await app.inject({
      method: 'POST',
      url: '/v1/uploads/image',
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload,
    });

    expect(response.statusCode).toBe(400);
  });

  it('POST /v1/uploads/image rejects a request with no file', async () => {
    const boundary = '----bposEmptyBoundary';
    const payload = Buffer.from(`--${boundary}--\r\n`);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/uploads/image',
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload,
    });

    expect(response.statusCode).toBe(400);
  });

  it('POST /v1/uploads/image requires authentication', async () => {
    const { boundary, payload } = buildMultipartPayload(
      Buffer.from('irrelevant'),
      'photo.jpg',
      'image/jpeg',
    );

    const response = await app.inject({
      method: 'POST',
      url: '/v1/uploads/image',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload,
    });

    expect(response.statusCode).toBe(401);
  });
});
