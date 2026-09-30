import { createTenant, type CreateTenantInput } from './service.js';

/**
 * Provision a tenant.
 *
 * Takes no RequestContext: tenant provisioning is the one operation that runs
 * before a tenant or user exists, so there is nothing to build a context from.
 * (Passing one previously caused every call to 500 — request.tenant is
 * undefined on this unauthenticated route.)
 */
export async function create(input: CreateTenantInput) {
  return createTenant(input);
}
