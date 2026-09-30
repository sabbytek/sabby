import type { RequestContext } from '../../shared/types/controller.js';
import { auditUserAction } from '../../shared/audit/tenant-audit.js';
import { createCustomer, listCustomers, getCustomer, updateCustomer } from './service.js';

export async function create(
  ctx: RequestContext,
  input: {
    firstName: string;
    lastName?: string;
    email?: string;
    phone?: string;
    address?: string;
    note?: string;
    consentGivenAt?: string;
    consentSource?: string;
  },
) {
  const customer = await createCustomer(ctx.schema, input);
  await auditUserAction(ctx, {
    action: 'customer.created',
    targetType: 'customer',
    targetId: customer.id,
  });
  return customer;
}

export async function list(
  ctx: RequestContext,
  query: { page?: string; limit?: string; search?: string },
) {
  return listCustomers(ctx.schema, {
    ...(query.page && { page: parseInt(query.page) }),
    ...(query.limit && { limit: parseInt(query.limit) }),
    ...(query.search && { search: query.search }),
  });
}

export async function get(ctx: RequestContext, id: string) {
  return getCustomer(ctx.schema, id);
}

export async function update(
  ctx: RequestContext,
  id: string,
  input: Partial<{
    firstName: string;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    note: string | null;
    consentGivenAt: string | null;
    consentSource: string | null;
  }>,
) {
  const { consentGivenAt, ...rest } = input;
  const customer = await updateCustomer(ctx.schema, id, {
    ...rest,
    ...(consentGivenAt !== undefined && {
      consentGivenAt: consentGivenAt ? new Date(consentGivenAt) : null,
    }),
  });
  await auditUserAction(ctx, {
    action: 'customer.updated',
    targetType: 'customer',
    targetId: id,
    metadata: { fields: Object.keys(input) },
  });
  return customer;
}
