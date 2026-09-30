import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from '@fastify/type-provider-zod';
import { requireAuth } from '../../shared/middleware/auth.js';
import { resolveTenant } from '../../shared/middleware/tenant.js';
import { requireFeature } from '../../shared/middleware/feature-gate.js';
import { createContext } from '../../shared/http/context.js';
import { sendSuccess, sendCsv } from '../../shared/http/response.js';
import * as controller from './controller.js';
import {
  plReportQuerySchema,
  bestSellersQuerySchema,
  revenueByLocationQuerySchema,
  staffSalesQuerySchema,
  inventoryValuationQuerySchema,
} from './validators.js';

export default async function reportingRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  // ─── P&L report ─────────────────────────────────────────────────────────────
  typed.get(
    '/pl',
    {
      preHandler: [requireAuth, resolveTenant, requireFeature('reporting:pl')],
      schema: {
        tags: ['Reporting'],
        summary: 'Profit & Loss report (derived from ledger)',
        description:
          'All figures derived from journal entries for the period. ' +
          'Revenue = account 4000 credits. Expenses = accounts 5000/5100/5200/5300 debits.',
        security: [{ bearerAuth: [] }],
        querystring: plReportQuerySchema,
      },
    },
    async (request, reply) => {
      const ctx = createContext(request);
      const report = await controller.getPL(ctx, request.query.from, request.query.to);
      return sendSuccess(reply, report);
    },
  );

  // ─── Best-selling products ───────────────────────────────────────────────────
  typed.get(
    '/best-sellers',
    {
      preHandler: [requireAuth, resolveTenant, requireFeature('reporting:pl')],
      schema: {
        tags: ['Reporting'],
        summary: 'Best-selling products by quantity sold',
        security: [{ bearerAuth: [] }],
        querystring: bestSellersQuerySchema,
      },
    },
    async (request, reply) => {
      const ctx = createContext(request);
      const rows = await controller.getBestSellers(ctx, request.query);
      return sendSuccess(reply, rows);
    },
  );

  // ─── Revenue by location ─────────────────────────────────────────────────────
  typed.get(
    '/revenue-by-location',
    {
      preHandler: [requireAuth, resolveTenant, requireFeature('reporting:revenue_by_location')],
      schema: {
        tags: ['Reporting'],
        summary: 'Revenue breakdown by location',
        security: [{ bearerAuth: [] }],
        querystring: revenueByLocationQuerySchema,
      },
    },
    async (request, reply) => {
      const ctx = createContext(request);
      const rows = await controller.getRevenueByLocation(ctx, request.query);
      return sendSuccess(reply, rows);
    },
  );

  // ─── Staff sales report ──────────────────────────────────────────────────────
  typed.get(
    '/staff-sales',
    {
      preHandler: [requireAuth, resolveTenant, requireFeature('reporting:staff_sales')],
      schema: {
        tags: ['Reporting'],
        summary: 'Sales performance by staff member',
        security: [{ bearerAuth: [] }],
        querystring: staffSalesQuerySchema,
      },
    },
    async (request, reply) => {
      const ctx = createContext(request);
      const rows = await controller.getStaffSales(ctx, request.query);
      return sendSuccess(reply, rows);
    },
  );

  // ─── P&L export (CSV) ────────────────────────────────────────────────────────
  typed.get(
    '/pl/export',
    {
      preHandler: [requireAuth, resolveTenant, requireFeature('reporting:pl')],
      schema: {
        tags: ['Reporting'],
        summary: 'Export P&L report as CSV',
        security: [{ bearerAuth: [] }],
        querystring: plReportQuerySchema,
      },
    },
    async (request, reply) => {
      const ctx = createContext(request);
      const csv = await controller.exportPL(ctx, request.query.from, request.query.to);
      return sendCsv(
        reply,
        csv,
        `pl-${request.query.from.slice(0, 10)}-${request.query.to.slice(0, 10)}.csv`,
      );
    },
  );

  // ─── Staff sales export (CSV) ─────────────────────────────────────────────────
  typed.get(
    '/staff-sales/export',
    {
      preHandler: [requireAuth, resolveTenant, requireFeature('reporting:staff_sales')],
      schema: {
        tags: ['Reporting'],
        summary: 'Export staff sales report as CSV',
        security: [{ bearerAuth: [] }],
        querystring: staffSalesQuerySchema,
      },
    },
    async (request, reply) => {
      const ctx = createContext(request);
      const csv = await controller.exportStaffSales(ctx, request.query);
      return sendCsv(reply, csv, 'staff-sales.csv');
    },
  );

  // ─── Inventory valuation ──────────────────────────────────────────────────────
  typed.get(
    '/inventory-valuation',
    {
      preHandler: [requireAuth, resolveTenant, requireFeature('reporting:margin')],
      schema: {
        tags: ['Reporting'],
        summary: 'Inventory valuation (quantity × cost per variant per location)',
        description: 'Gated to manager+ via reporting:margin feature flag. Cost data is sensitive.',
        security: [{ bearerAuth: [] }],
        querystring: inventoryValuationQuerySchema,
      },
    },
    async (request, reply) => {
      const ctx = createContext(request);

      if (request.query.format === 'csv') {
        const csv = await controller.exportInventoryValuation(ctx);
        return sendCsv(reply, csv, 'inventory-valuation.csv');
      }

      const rows = await controller.getInventoryValuation(ctx);
      const totalValueKobo = rows.reduce((s, r) => s + r.totalValueKobo, 0);
      return sendSuccess(reply, { rows, totalValueKobo });
    },
  );
}
