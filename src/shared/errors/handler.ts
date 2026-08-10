import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from './types.js';
import { notifySlackError } from '../alerts/slack.js';

export function errorHandler(
  error: FastifyError | Error,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  const logger = request.log;

  if (error instanceof AppError) {
    logger.warn({ err: error, code: error.code }, error.message);
    if (error.statusCode >= 500) {
      notifySlackError({
        message: error.message,
        code: error.code,
        statusCode: error.statusCode,
        method: request.method,
        url: request.url,
        requestId: request.id,
        ...(error.stack !== undefined ? { stack: error.stack } : {}),
      });
    }
    reply.status(error.statusCode).send({
      success: false,
      error: {
        code: error.code,
        message: error.message,
        ...(error.details !== undefined ? { details: error.details } : {}),
      },
    });
    return;
  }

  // Fastify validation errors (from route schema)
  const fastifyError = error as FastifyError;
  if (fastifyError.validation) {
    logger.warn({ err: error }, 'Request validation failed');
    reply.status(400).send({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: fastifyError.validation,
      },
    });
    return;
  }

  logger.error({ err: error }, 'Unhandled error');
  notifySlackError({
    message: error.message,
    statusCode: 500,
    method: request.method,
    url: request.url,
    requestId: request.id,
    ...(error.stack !== undefined ? { stack: error.stack } : {}),
  });
  reply.status(500).send({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    },
  });
}
