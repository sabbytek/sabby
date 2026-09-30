/**
 * Platform staff administration — CRUD over public.platform_users.
 *
 * This is how a second platform account comes to exist without hand-editing the
 * database. It is deliberately the highest-trust surface in the app: creating or
 * promoting a platform user hands out cross-tenant power, so the guards here are
 * the point, not incidental.
 */

import argon2 from 'argon2';
import { randomBytes } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { and, desc, eq, ilike, ne, or, sql, type SQL } from 'drizzle-orm';
import { db } from '../../../shared/db/client.js';
import { platformUsers, platformSessions } from '../../../shared/db/schema/public.js';
import { ConflictError, NotFoundError } from '../../../shared/errors/types.js';
import type { PlatformRole } from '../../../config/platform-permissions.js';

/** Columns safe to return over the API — never the password hash or MFA secret. */
const publicColumns = {
  id: platformUsers.id,
  email: platformUsers.email,
  firstName: platformUsers.firstName,
  lastName: platformUsers.lastName,
  role: platformUsers.role,
  isActive: platformUsers.isActive,
  mfaEnabledAt: platformUsers.mfaEnabledAt,
  lastLoginAt: platformUsers.lastLoginAt,
  createdAt: platformUsers.createdAt,
  updatedAt: platformUsers.updatedAt,
} as const;

export interface CreatePlatformUserInput {
  email: string;
  firstName: string;
  lastName: string;
  role: PlatformRole;
  temporaryPassword: string;
}

export interface UpdatePlatformUserInput {
  firstName?: string;
  lastName?: string;
  role?: PlatformRole;
  isActive?: boolean;
}

export async function listPlatformUsers(query: {
  search?: string;
  role?: PlatformRole;
  isActive?: boolean;
  page: number;
  limit: number;
}) {
  const filters: SQL[] = [];
  if (query.role) filters.push(eq(platformUsers.role, query.role));
  if (query.isActive !== undefined) filters.push(eq(platformUsers.isActive, query.isActive));
  if (query.search) {
    const term = `%${query.search}%`;
    const match = or(
      ilike(platformUsers.email, term),
      ilike(platformUsers.firstName, term),
      ilike(platformUsers.lastName, term),
    );
    if (match) filters.push(match);
  }
  const where = filters.length > 0 ? and(...filters) : undefined;

  const items = await db
    .select(publicColumns)
    .from(platformUsers)
    .where(where)
    .orderBy(desc(platformUsers.createdAt))
    .limit(query.limit)
    .offset((query.page - 1) * query.limit);

  const [counted] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(platformUsers)
    .where(where);

  return { items, total: counted?.count ?? 0 };
}

export async function getPlatformUser(id: string) {
  const [user] = await db.select(publicColumns).from(platformUsers).where(eq(platformUsers.id, id));
  if (!user) throw new NotFoundError('Platform user', id);
  return user;
}

export async function createPlatformUser(input: CreatePlatformUserInput) {
  const email = input.email.toLowerCase();

  const [existing] = await db
    .select({ id: platformUsers.id })
    .from(platformUsers)
    .where(eq(platformUsers.email, email))
    .limit(1);
  if (existing) throw new ConflictError(`A platform user with email '${email}' already exists`);

  const id = uuidv4();
  await db.insert(platformUsers).values({
    id,
    email,
    passwordHash: await argon2.hash(input.temporaryPassword),
    firstName: input.firstName,
    lastName: input.lastName,
    role: input.role,
  });

  return getPlatformUser(id);
}

export async function updatePlatformUser(
  id: string,
  actorId: string,
  input: UpdatePlatformUserInput,
) {
  const target = await getRawUser(id);

  // Guard the one change that can lock everyone out: removing the platform's
  // last active super_admin, whether by demotion or deactivation.
  const removesSuperAdmin =
    target.role === 'super_admin' &&
    target.isActive &&
    ((input.role !== undefined && input.role !== 'super_admin') || input.isActive === false);
  if (removesSuperAdmin) await assertNotLastSuperAdmin(id);

  // A user must not deactivate their own account and strand their session.
  if (input.isActive === false && id === actorId) {
    throw new ConflictError('You cannot deactivate your own account');
  }

  await db
    .update(platformUsers)
    .set({
      ...(input.firstName !== undefined && { firstName: input.firstName }),
      ...(input.lastName !== undefined && { lastName: input.lastName }),
      ...(input.role !== undefined && { role: input.role }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
      updatedAt: new Date(),
    })
    .where(eq(platformUsers.id, id));

  // Deactivation and demotion take effect immediately: drop live sessions so a
  // downgraded admin cannot ride an unexpired refresh token.
  if (input.isActive === false || (input.role !== undefined && input.role !== target.role)) {
    await revokeAllSessions(id);
  }

  return {
    user: await getPlatformUser(id),
    previous: { role: target.role, isActive: target.isActive },
  };
}

export async function deactivatePlatformUser(id: string, actorId: string) {
  if (id === actorId) throw new ConflictError('You cannot deactivate your own account');

  const target = await getRawUser(id);
  if (target.role === 'super_admin' && target.isActive) await assertNotLastSuperAdmin(id);

  await db
    .update(platformUsers)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(platformUsers.id, id));
  await revokeAllSessions(id);

  return { id, isActive: false };
}

/**
 * Reset a platform user's password to a freshly generated temporary secret,
 * returned once to the caller to hand over out of band. Their live sessions are
 * revoked so the old credential is dead immediately. MFA enrolment is left
 * intact — this recovers a forgotten password, not a lost second factor.
 */
export async function resetPlatformUserPassword(id: string) {
  await getRawUser(id); // 404 if missing

  const temporaryPassword = randomBytes(15).toString('base64url');
  await db
    .update(platformUsers)
    .set({ passwordHash: await argon2.hash(temporaryPassword), updatedAt: new Date() })
    .where(eq(platformUsers.id, id));
  await revokeAllSessions(id);

  return { id, temporaryPassword };
}

// ─── internals ───────────────────────────────────────────────────────────────

async function getRawUser(id: string) {
  const [user] = await db
    .select({ id: platformUsers.id, role: platformUsers.role, isActive: platformUsers.isActive })
    .from(platformUsers)
    .where(eq(platformUsers.id, id))
    .limit(1);
  if (!user) throw new NotFoundError('Platform user', id);
  return user;
}

/** Throw unless at least one OTHER active super_admin would remain. */
async function assertNotLastSuperAdmin(excludingId: string): Promise<void> {
  const [counted] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(platformUsers)
    .where(
      and(
        eq(platformUsers.role, 'super_admin'),
        eq(platformUsers.isActive, true),
        ne(platformUsers.id, excludingId),
      ),
    );
  if ((counted?.count ?? 0) === 0) {
    throw new ConflictError(
      'Cannot remove the last active super_admin — promote another account first',
    );
  }
}

async function revokeAllSessions(platformUserId: string): Promise<void> {
  await db
    .update(platformSessions)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(platformSessions.platformUserId, platformUserId),
        sql`${platformSessions.revokedAt} IS NULL`,
      ),
    );
}
