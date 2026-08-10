import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import { env } from '../config/env.js';

async function multipartPlugin(app: FastifyInstance) {
  await app.register(multipart, {
    limits: {
      fileSize: env.MAX_UPLOAD_SIZE_BYTES,
      files: 1,
    },
  });
}

export default fp(multipartPlugin, { name: 'multipart' });
