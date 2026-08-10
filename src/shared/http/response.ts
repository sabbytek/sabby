/**
 * HTTP response helpers for controllers.
 * Centralizes response formatting to avoid repetition.
 */

import type { FastifyReply } from 'fastify';

/**
 * Send a success response with optional status code.
 */
export function sendSuccess<T>(reply: FastifyReply, data: T, status = 200): void {
  reply.status(status).send({ success: true, data });
}

/**
 * Send a created response (201).
 */
export function sendCreated<T>(reply: FastifyReply, data: T): void {
  sendSuccess(reply, data, 201);
}

/**
 * Send a success message response.
 */
export function sendMessage(reply: FastifyReply, message: string, status = 200): void {
  reply.status(status).send({ success: true, data: { message } });
}

/**
 * Send a CSV file download.
 */
export function sendCsv(reply: FastifyReply, csv: string, filename: string): void {
  reply
    .header('Content-Type', 'text/csv')
    .header('Content-Disposition', `attachment; filename="${filename}"`)
    .send(csv);
}

/**
 * Send a paginated response.
 */
export function sendPaginated<T>(
  reply: FastifyReply,
  items: T[],
  total: number,
  page: number,
  limit: number,
): void {
  sendSuccess(reply, {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}
