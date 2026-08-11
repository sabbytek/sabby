import type { RequestContext } from '../../shared/types/controller.js';
import {
  createCustomer,
  listCustomers,
  getCustomer,
  updateCustomer,
} from './service.js';

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
): Promise<unknown> {
  const result = await createCustomer(ctx.schema, input);
  return result;
}

export async function list(
  ctx: RequestContext,
  query: { page?: string; limit?: string; search?: string },
): Promise<unknown> {
  const result = await listCustomers(ctx.schema, {
    ...(query.page && { page: parseInt(query.page) }),
    ...(query.limit && { limit: parseInt(query.limit) }),
    ...(query.search && { search: query.search }),
  });
  return result;
}

export async function get(ctx: RequestContext, id: string): Promise<unknown> {
  const result = await getCustomer(ctx.schema, id);
  return result;
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
): Promise<unknown> {
  const { consentGivenAt, ...rest } = input;
  const result = await updateCustomer(ctx.schema, id, {
    ...rest,
    ...(consentGivenAt !== undefined && {
      consentGivenAt: consentGivenAt ? new Date(consentGivenAt) : null,
    }),
  });
  return result;
}
