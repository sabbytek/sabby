import argon2 from 'argon2';
import { v4 as uuidv4 } from 'uuid';
import { eq, and } from 'drizzle-orm';
import { withTenantSchema } from '../../shared/db/tenant.js';
import { users } from '../../shared/db/schema/tenant.js';
import { NotFoundError, ConflictError } from '../../shared/errors/types.js';
import type { UserRole } from '../../shared/types/index.js';

export async function listStaff(schemaName: string) {
  return withTenantSchema(schemaName, async (db) => {
    return db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        phone: users.phone,
        role: users.role,
        locationId: users.locationId,
        isActive: users.isActive,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
      })
      .from(users);
  });
}

export async function getStaffMember(schemaName: string, userId: string) {
  return withTenantSchema(schemaName, async (db) => {
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        phone: users.phone,
        role: users.role,
        locationId: users.locationId,
        isActive: users.isActive,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user) throw new NotFoundError('Staff member', userId);
    return user;
  });
}

export async function inviteStaff(
  schemaName: string,
  input: {
    email: string;
    firstName: string;
    lastName: string;
    role: UserRole;
    phone?: string;
    locationId?: string;
    temporaryPassword: string;
  },
) {
  return withTenantSchema(schemaName, async (db) => {
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, input.email.toLowerCase()))
      .limit(1);
    if (existing) throw new ConflictError(`Email '${input.email}' is already registered`);

    const passwordHash = await argon2.hash(input.temporaryPassword);
    const id = uuidv4();

    await db.insert(users).values({
      id,
      email: input.email.toLowerCase(),
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone ?? null,
      role: input.role as 'owner' | 'manager' | 'staff' | 'viewer',
      locationId: input.locationId ?? null,
    });

    const [created] = await db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        role: users.role,
        locationId: users.locationId,
        isActive: users.isActive,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, id));

    return created!;
  });
}

export async function updateStaffMember(
  schemaName: string,
  userId: string,
  input: Partial<{
    firstName: string;
    lastName: string;
    phone: string | null;
    role: UserRole;
    locationId: string | null;
    isActive: boolean;
  }>,
) {
  return withTenantSchema(schemaName, async (db) => {
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!existing) throw new NotFoundError('Staff member', userId);

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (input.firstName !== undefined) updateData['firstName'] = input.firstName;
    if (input.lastName !== undefined) updateData['lastName'] = input.lastName;
    if (input.phone !== undefined) updateData['phone'] = input.phone;
    if (input.role !== undefined) updateData['role'] = input.role;
    if (input.locationId !== undefined) updateData['locationId'] = input.locationId;
    if (input.isActive !== undefined) updateData['isActive'] = input.isActive;

    await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, userId));

    const [updated] = await db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        phone: users.phone,
        role: users.role,
        locationId: users.locationId,
        isActive: users.isActive,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, userId));

    return updated!;
  });
}

export async function deactivateStaffMember(
  schemaName: string,
  userId: string,
  requestingUserId: string,
) {
  if (userId === requestingUserId) {
    throw new ConflictError('You cannot deactivate your own account');
  }

  return withTenantSchema(schemaName, async (db) => {
    const [existing] = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!existing) throw new NotFoundError('Staff member', userId);
    if (existing.role === 'owner') throw new ConflictError('Cannot deactivate the owner account');

    await db
      .update(users)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(users.id, userId));
  });
}
