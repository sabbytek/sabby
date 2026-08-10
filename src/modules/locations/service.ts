import { v4 as uuidv4 } from 'uuid';
import { eq, and } from 'drizzle-orm';
import { withTenantSchema } from '../../shared/db/tenant.js';
import { locations } from '../../shared/db/schema/tenant.js';
import { NotFoundError, ConflictError } from '../../shared/errors/types.js';

export async function listLocations(schemaName: string) {
  return withTenantSchema(schemaName, async (db) => {
    return db.select().from(locations);
  });
}

export async function getLocation(schemaName: string, locationId: string) {
  return withTenantSchema(schemaName, async (db) => {
    const [loc] = await db
      .select()
      .from(locations)
      .where(eq(locations.id, locationId))
      .limit(1);
    if (!loc) throw new NotFoundError('Location', locationId);
    return loc;
  });
}

export async function createLocation(
  schemaName: string,
  input: {
    name: string;
    address?: string;
    phone?: string;
    isDefault?: boolean;
  },
) {
  return withTenantSchema(schemaName, async (db) => {
    if (input.isDefault) {
      // Clear existing default before setting a new one
      await db.update(locations).set({ isDefault: false });
    }

    const id = uuidv4();
    await db.insert(locations).values({
      id,
      name: input.name,
      address: input.address ?? null,
      phone: input.phone ?? null,
      isDefault: input.isDefault ?? false,
    });

    const [loc] = await db.select().from(locations).where(eq(locations.id, id));
    return loc!;
  });
}

export async function updateLocation(
  schemaName: string,
  locationId: string,
  input: Partial<{
    name: string;
    address: string | null;
    phone: string | null;
    isDefault: boolean;
    isActive: boolean;
  }>,
) {
  return withTenantSchema(schemaName, async (db) => {
    const [existing] = await db
      .select({ id: locations.id })
      .from(locations)
      .where(eq(locations.id, locationId))
      .limit(1);
    if (!existing) throw new NotFoundError('Location', locationId);

    if (input.isDefault) {
      await db
        .update(locations)
        .set({ isDefault: false })
        .where(and(eq(locations.isDefault, true)));
    }

    await db
      .update(locations)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(locations.id, locationId));

    const [updated] = await db.select().from(locations).where(eq(locations.id, locationId));
    return updated!;
  });
}

export async function deactivateLocation(schemaName: string, locationId: string) {
  return withTenantSchema(schemaName, async (db) => {
    const [existing] = await db
      .select({ id: locations.id, isDefault: locations.isDefault })
      .from(locations)
      .where(eq(locations.id, locationId))
      .limit(1);
    if (!existing) throw new NotFoundError('Location', locationId);
    if (existing.isDefault) {
      throw new ConflictError('Cannot deactivate the default location');
    }

    await db
      .update(locations)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(locations.id, locationId));
  });
}
