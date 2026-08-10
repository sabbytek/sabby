import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { env } from '../config/env.js';

async function corsPlugin(app: FastifyInstance) {
  const origins = env.CORS_ORIGINS.split(',').map((o) => o.trim());

  await app.register(cors, {
    origin: env.NODE_ENV === 'development' ? true : origins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Tenant-ID'],
    exposedHeaders: ['X-Request-ID'],
  });
}

export default fp(corsPlugin, { name: 'cors' });
