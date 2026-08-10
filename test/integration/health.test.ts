import { describe, it, expect, afterAll } from 'vitest';
import { getTestApp, closeTestApp } from '../helpers/app.js';

describe('Health check', () => {
  afterAll(async () => {
    await closeTestApp();
  });

  it('GET /health returns 200 with status ok', async () => {
    const app = await getTestApp();
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ status: string; environment: string }>();
    expect(body.status).toBe('ok');
    expect(body.environment).toBe('test');
  });
});
