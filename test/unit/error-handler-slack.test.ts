import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { errorHandler } from '../../src/shared/errors/handler.js';
import { NotFoundError, ExternalServiceError } from '../../src/shared/errors/types.js';

vi.mock('../../src/shared/alerts/slack.js', () => ({
  notifySlackError: vi.fn(),
}));

function fakeRequest(): FastifyRequest {
  return {
    log: { warn: vi.fn(), error: vi.fn() },
    method: 'GET',
    url: '/v1/whatever',
    id: 'req-1',
  } as unknown as FastifyRequest;
}

function fakeReply(): FastifyReply {
  const reply = {
    status: vi.fn(() => reply),
    send: vi.fn(() => reply),
  };
  return reply as unknown as FastifyReply;
}

describe('errorHandler Slack alerting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not alert Slack for 4xx AppErrors', async () => {
    const { notifySlackError } = await import('../../src/shared/alerts/slack.js');
    errorHandler(new NotFoundError('Product', '123'), fakeRequest(), fakeReply());
    expect(notifySlackError).not.toHaveBeenCalled();
  });

  it('alerts Slack for 5xx AppErrors', async () => {
    const { notifySlackError } = await import('../../src/shared/alerts/slack.js');
    errorHandler(new ExternalServiceError('R2', 'timeout'), fakeRequest(), fakeReply());
    expect(notifySlackError).toHaveBeenCalledTimes(1);
    expect(notifySlackError).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 502, code: 'EXTERNAL_SERVICE_ERROR' }),
    );
  });

  it('alerts Slack for unhandled non-AppError errors', async () => {
    const { notifySlackError } = await import('../../src/shared/alerts/slack.js');
    errorHandler(new Error('boom'), fakeRequest(), fakeReply());
    expect(notifySlackError).toHaveBeenCalledTimes(1);
    expect(notifySlackError).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500, message: 'boom' }),
    );
  });
});
