import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('notifySlackError', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('posts a formatted message to the configured webhook', async () => {
    vi.stubEnv('SLACK_WEBHOOK_URL', 'https://hooks.slack.com/services/test');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const { notifySlackError } = await import('../../src/shared/alerts/slack.js');

    notifySlackError({
      message: 'Ledger imbalance detected',
      code: 'LEDGER_IMBALANCE',
      statusCode: 500,
      method: 'POST',
      url: '/v1/orders/order-1/checkout',
      requestId: 'req-123',
      stack: 'Error: boom\n  at foo (bar.ts:1:1)',
    });

    // Fire-and-forget: allow the microtask queue to flush
    await new Promise((resolve) => setImmediate(resolve));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://hooks.slack.com/services/test');
    expect(options.method).toBe('POST');
    const body = JSON.parse(options.body as string) as { text: string };
    expect(body.text).toContain('500');
    expect(body.text).toContain('LEDGER_IMBALANCE');
    expect(body.text).toContain('POST /v1/orders/order-1/checkout');
    expect(body.text).toContain('Ledger imbalance detected');
    expect(body.text).toContain('req-123');
  });

  it('does nothing when no webhook URL is configured', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { notifySlackError } = await import('../../src/shared/alerts/slack.js');

    notifySlackError({
      message: 'Should not be sent',
      statusCode: 500,
      method: 'GET',
      url: '/v1/health',
    });

    await new Promise((resolve) => setImmediate(resolve));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('swallows delivery failures without throwing', async () => {
    vi.stubEnv('SLACK_WEBHOOK_URL', 'https://hooks.slack.com/services/test');
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);

    const { notifySlackError } = await import('../../src/shared/alerts/slack.js');

    expect(() =>
      notifySlackError({
        message: 'Should not throw',
        statusCode: 502,
        method: 'GET',
        url: '/v1/health',
      }),
    ).not.toThrow();

    await new Promise((resolve) => setImmediate(resolve));
  });
});
