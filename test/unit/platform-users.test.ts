import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConflictError } from '../../src/shared/errors/types.js';

// Programmable DB stub: each db.select(...) resolves to the next queued result,
// so a test can script the exact sequence of reads a service call makes
// (getRawUser, then the last-super_admin count). Writes resolve to nothing.
const selectResults: unknown[][] = [];

function chain(rows: unknown[]): Record<string, unknown> {
  const c: Record<string, unknown> = {};
  for (const m of ['from', 'where', 'orderBy', 'limit', 'offset', 'set', 'values', 'returning']) {
    c[m] = () => chain(rows);
  }
  c['then'] = (res: (v: unknown) => unknown) => Promise.resolve(rows).then(res);
  return c;
}

vi.mock('../../src/shared/db/client.js', () => {
  const db = {
    select: () => chain(selectResults.shift() ?? []),
    update: () => chain([]),
    insert: () => chain([]),
    delete: () => chain([]),
  };
  return { db, getDb: () => db };
});

const { deactivatePlatformUser, updatePlatformUser } =
  await import('../../src/modules/platform/users/service.js');

const superAdmin = { id: 'pu-1', role: 'super_admin', isActive: true };

beforeEach(() => {
  selectResults.length = 0;
});

describe('platform user safety rails', () => {
  it('refuses to let a user deactivate their own account', async () => {
    await expect(deactivatePlatformUser('pu-1', 'pu-1')).rejects.toBeInstanceOf(ConflictError);
  });

  it('refuses to deactivate the last active super_admin', async () => {
    selectResults.push([superAdmin]); // getRawUser
    selectResults.push([{ count: 0 }]); // no other active super_admin
    await expect(deactivatePlatformUser('pu-1', 'someone-else')).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it('deactivates a super_admin when another active super_admin remains', async () => {
    selectResults.push([superAdmin]); // getRawUser
    selectResults.push([{ count: 1 }]); // a backup super_admin exists
    await expect(deactivatePlatformUser('pu-1', 'someone-else')).resolves.toEqual({
      id: 'pu-1',
      isActive: false,
    });
  });

  it('refuses to demote the last active super_admin', async () => {
    selectResults.push([superAdmin]); // getRawUser
    selectResults.push([{ count: 0 }]); // no other active super_admin
    await expect(
      updatePlatformUser('pu-1', 'someone-else', { role: 'admin' }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('allows a name change on a super_admin without a super_admin count check', async () => {
    selectResults.push([superAdmin]); // getRawUser
    // No count check should be consulted; provide the reload getPlatformUser needs.
    selectResults.push([{ id: 'pu-1', firstName: 'New', role: 'super_admin', isActive: true }]);
    await expect(
      updatePlatformUser('pu-1', 'someone-else', { firstName: 'New' }),
    ).resolves.toHaveProperty('user');
  });
});
