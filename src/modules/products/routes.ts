import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from '@fastify/type-provider-zod';
import { requireAuth } from '../../shared/middleware/auth.js';
import { resolveTenant } from '../../shared/middleware/tenant.js';
import { requireManager } from '../../shared/middleware/auth.js';
import { createContext } from '../../shared/http/context.js';
import { sendSuccess, sendCreated } from '../../shared/http/response.js';
import * as controller from './controller.js';
import {
  createCategoryBodySchema,
  listProductsQuerySchema,
  createProductBodySchema,
  updateProductBodySchema,
  idParamsSchema,
  createVariantBodySchema,
  variantParamsSchema,
  updateVariantBodySchema,
} from './validators.js';

const managerGuard = [requireAuth, resolveTenant, requireManager];
const readGuard = [requireAuth, resolveTenant];

export default async function productsRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  // ─── Categories ────────────────────────────────────────────────────────────

  typed.post(
    '/categories',
    {
      preHandler: managerGuard,
      schema: {
        tags: ['Products'],
        summary: 'Create a product category',
        security: [{ bearerAuth: [] }],
        body: createCategoryBodySchema,
      },
    },
    async (request, reply) => {
      const ctx = createContext(request);
      const category = await controller.createCategoryHandler(ctx, request.body);
      return sendCreated(reply, category);
    },
  );

  typed.get(
    '/categories',
    {
      preHandler: readGuard,
      schema: {
        tags: ['Products'],
        summary: 'List all product categories',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const ctx = createContext(request);
      const cats = await controller.listCategoriesHandler(ctx);
      return sendSuccess(reply, cats);
    },
  );

  // ─── Products ──────────────────────────────────────────────────────────────

  typed.post(
    '/',
    {
      preHandler: managerGuard,
      schema: {
        tags: ['Products'],
        summary: 'Create a product',
        security: [{ bearerAuth: [] }],
        body: createProductBodySchema,
      },
    },
    async (request, reply) => {
      const ctx = createContext(request);
      const product = await controller.createProductHandler(ctx, request.body);
      return sendCreated(reply, product);
    },
  );

  typed.get(
    '/',
    {
      preHandler: readGuard,
      schema: {
        tags: ['Products'],
        summary: 'List products (paginated)',
        security: [{ bearerAuth: [] }],
        querystring: listProductsQuerySchema,
      },
    },
    async (request, reply) => {
      const ctx = createContext(request);
      const result = await controller.listProductsHandler(ctx, request.query);
      return sendSuccess(reply, result);
    },
  );

  typed.get(
    '/:id',
    {
      preHandler: readGuard,
      schema: {
        tags: ['Products'],
        summary: 'Get a product with its variants',
        security: [{ bearerAuth: [] }],
        params: idParamsSchema,
      },
    },
    async (request, reply) => {
      const ctx = createContext(request);
      const product = await controller.getProductHandler(ctx, request.params.id);
      return sendSuccess(reply, product);
    },
  );

  typed.patch(
    '/:id',
    {
      preHandler: managerGuard,
      schema: {
        tags: ['Products'],
        summary: 'Update a product',
        security: [{ bearerAuth: [] }],
        params: idParamsSchema,
        body: updateProductBodySchema,
      },
    },
    async (request, reply) => {
      const ctx = createContext(request);
      const product = await controller.updateProductHandler(ctx, request.params.id, request.body);
      return sendSuccess(reply, product);
    },
  );

  // ─── Variants ──────────────────────────────────────────────────────────────

  typed.post(
    '/:id/variants',
    {
      preHandler: managerGuard,
      schema: {
        tags: ['Products'],
        summary: 'Add a variant to a product',
        security: [{ bearerAuth: [] }],
        params: idParamsSchema,
        body: createVariantBodySchema,
      },
    },
    async (request, reply) => {
      const ctx = createContext(request);
      const variant = await controller.createVariantHandler(ctx, request.params.id, request.body);
      return sendCreated(reply, variant);
    },
  );

  typed.patch(
    '/:id/variants/:vid',
    {
      preHandler: managerGuard,
      schema: {
        tags: ['Products'],
        summary: 'Update a product variant',
        security: [{ bearerAuth: [] }],
        params: variantParamsSchema,
        body: updateVariantBodySchema,
      },
    },
    async (request, reply) => {
      const ctx = createContext(request);
      const variant = await controller.updateVariantHandler(
        ctx,
        request.params.id,
        request.params.vid,
        request.body,
      );
      return sendSuccess(reply, variant);
    },
  );
}
