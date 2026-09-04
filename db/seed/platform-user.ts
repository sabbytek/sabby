#!/usr/bin/env tsx
/**
 * Seeds the first platform user (default role: super_admin).
 *
 * There is deliberately NO public route to create the first platform user;
 * bootstrapping happens here, against the database directly.
 *
 * Usage:
 *   PLATFORM_SEED_EMAIL=ops@sabby.example \
 *   PLATFORM_SEED_NAME="Jane Doe" \
 *   PLATFORM_SEED_PASSWORD='a-strong-password' \
 *   npm run db:seed:platform
 *
 * Optional: PLATFORM_SEED_ROLE=admin|support|super_admin (default super_admin).
 * Idempotent on email: re-running with an existing email is a no-op.
 *
 * MFA is not enabled here. The seeded user enrols MFA on first login via the
 * console (POST /v1/platform/auth/mfa/enroll + confirm).
 */
import { v4 as uuidv4 } from 'uuid';
import argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import { db } from '../../src/shared/db/client.js';
import { platformUsers } from '../../src/shared/db/schema/public.js';
import type { PlatformRole } from '../../src/shared/types/index.js';

const VALID_ROLES: PlatformRole[] = ['support', 'admin', 'super_admin'];

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value || value.trim().length === 0) {
    console.error(`Missing required env var: ${key}`);
    process.exit(1);
  }
  return value;
}

async function main() {
  const email = requireEnv('PLATFORM_SEED_EMAIL').toLowerCase();
  const name = requireEnv('PLATFORM_SEED_NAME');
  const password = requireEnv('PLATFORM_SEED_PASSWORD');
  const role = (process.env.PLATFORM_SEED_ROLE ?? 'super_admin') as PlatformRole;

  if (!VALID_ROLES.includes(role)) {
    console.error(`Invalid PLATFORM_SEED_ROLE '${role}'. Must be one of: ${VALID_ROLES.join(', ')}`);
    process.exit(1);
  }
  if (password.length < 12) {
    console.error('PLATFORM_SEED_PASSWORD must be at least 12 characters.');
    process.exit(1);
  }

  const [existing] = await db
    .select({ id: platformUsers.id })
    .from(platformUsers)
    .where(eq(platformUsers.email, email))
    .limit(1);

  if (existing) {
    console.log(`Platform user ${email} already exists (${existing.id}); nothing to do.`);
    return;
  }

  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  const id = uuidv4();
  await db.insert(platformUsers).values({ id, email, name, passwordHash, role });
  console.log(`Created platform user ${email} with role '${role}' (${id}).`);
  console.log('Next: log in via the console and enrol MFA immediately.');
}

main().catch((err) => {
  console.error('Platform user seed failed:', err);
  process.exit(1);
});
