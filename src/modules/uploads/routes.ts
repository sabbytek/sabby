import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from '@fastify/type-provider-zod';
import { z } from 'zod';
import { requireAuth } from '../../shared/middleware/auth.js';
import { resolveTenant } from '../../shared/middleware/tenant.js';
import { ValidationError } from '../../shared/errors/types.js';
import { env } from '../../config/env.js';
import { createContext } from '../../shared/http/context.js';
import { sendCreated } from '../../shared/http/response.js';
import * as controller from './controller.js';

const guard = [requireAuth, resolveTenant];

function mapFileTooLarge(err: Error & { code?: string }): never {
  if (err.code === 'FST_REQ_FILE_TOO_LARGE') {
    throw new ValidationError(
      `File too large. Maximum size: ${String(env.MAX_UPLOAD_SIZE_BYTES)} bytes`,
    );
  }
  throw err;
}

export default async function uploadsRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.post(
    '/image',
    {
      preHandler: guard,
      schema: {
        tags: ['Uploads'],
        summary: 'Upload and compress an image (product photo, expense receipt, etc.)',
        description:
          'Accepts a single multipart image file (jpeg/png/webp) and compresses it.\n\n' +
          '- `visibility=public` (default): stored on Cloudflare R2. Returns a permanent `url`; ' +
          'use it for product images.\n' +
          '- `visibility=private`: stored privately (R2 private bucket or Neon, per ' +
          '`PRIVATE_STORAGE_PROVIDER`). Returns `ref` (`r2://…` or `neon://…`) and a signed ' +
          '`url` valid for 1 hour. Store `ref` (e.g. as an expense ' +
          '`receiptUrl`); reading that resource later returns a fresh signed link.',
        querystring: z.object({
          visibility: z.enum(['public', 'private']).default('public'),
        }),
        security: [{ bearerAuth: [] }],
        consumes: ['multipart/form-data'],
      },
    },
    async (request, reply) => {
      const file = await request.file().catch(mapFileTooLarge);
      if (!file) {
        throw new ValidationError('No file provided');
      }

      const buffer = await file.toBuffer().catch(mapFileTooLarge);

      const ctx = createContext(request);
      const result = await controller.upload(ctx, {
        buffer,
        mimeType: file.mimetype,
        visibility: request.query.visibility,
      });

      return sendCreated(reply, result);
    },
  );
}
