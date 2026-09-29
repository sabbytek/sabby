/**
 * Platform (internal staff) authentication.
 *
 * Mirrors modules/auth/service.ts, with three deliberate differences:
 *   1. Accounts come from public.platform_users, never a tenant's users table.
 *   2. Tokens are signed with the 'platform' JWT namespace (JWT_PLATFORM_SECRET).
 *   3. Sessions are short — see env.JWT_PLATFORM_REFRESH_EXPIRY.
 */

import argon2 from 'argon2';
import { randomBytes } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { db } from '../../../shared/db/client.js';
import { platformUsers, platformSessions } from '../../../shared/db/schema/public.js';
import { UnauthorizedError } from '../../../shared/errors/types.js';
import type { PlatformJwtPayload } from '../../../shared/types/index.js';
import { requiresMfa } from '../../../config/platform-permissions.js';
import { env } from '../../../config/env.js';
import { createTotpEnrolment, verifyTotp, verifyTotpPlain } from './totp.js';
import { signPlatformToken } from './jwt.js';
import { decrypt } from '../../../shared/crypto/encrypt.js';

/** Refresh tokens are 32 cryptographically random bytes, not a UUID. */
const TOKEN_PREFIX_LEN = 16;
const REFRESH_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

function generateRefreshToken(): string {
  return randomBytes(32).toString('hex');
}

function refreshExpiry(): Date {
  return new Date(Date.now() + REFRESH_TTL_MS);
}

export interface PlatformLoginResult {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
  };
}

export interface SessionMeta {
  ipAddress?: string;
  userAgent?: string;
}

export async function loginPlatformUser(
  app: FastifyInstance,
  email: string,
  password: string,
  totpCode: string | undefined,
  meta: SessionMeta,
): Promise<PlatformLoginResult> {
  const [user] = await db
    .select()
    .from(platformUsers)
    .where(and(eq(platformUsers.email, email.toLowerCase()), eq(platformUsers.isActive, true)))
    .limit(1);

  // Uniform failure message — never reveal whether the account exists.
  const invalid = (): never => {
    throw new UnauthorizedError('Invalid credentials');
  };

  if (!user) {
    // Burn comparable time so a missing account is not distinguishable by timing.
    await argon2.hash(password);
    return invalid();
  }

  const passwordOk = await argon2.verify(user.passwordHash, password);
  if (!passwordOk) return invalid();

  // High-privilege roles cannot authenticate on a password alone.
  if (requiresMfa(user.role)) {
    if (!user.mfaEnabledAt || !user.mfaSecretEncrypted) {
      throw new UnauthorizedError(
        'MFA enrolment is required for this role. Complete /v1/platform/auth/mfa/setup first.',
      );
    }
    if (!totpCode) {
      throw new UnauthorizedError('MFA code required');
    }
    if (!(await verifyTotp(user.mfaSecretEncrypted, totpCode, user.id))) {
      throw new UnauthorizedError('Invalid MFA code');
    }
  }

  const payload: PlatformJwtPayload = {
    sub: user.id,
    role: user.role,
    email: user.email,
    aud: 'platform',
    type: 'access',
  };

  const accessToken = signPlatformToken(app, payload, env.JWT_PLATFORM_ACCESS_EXPIRY);

  const rawRefreshToken = generateRefreshToken();

  await db.insert(platformSessions).values({
    id: uuidv4(),
    platformUserId: user.id,
    tokenHash: await argon2.hash(rawRefreshToken),
    tokenPrefix: rawRefreshToken.slice(0, TOKEN_PREFIX_LEN),
    ipAddress: meta.ipAddress ?? null,
    userAgent: meta.userAgent ?? null,
    expiresAt: refreshExpiry(),
  });

  await db
    .update(platformUsers)
    .set({ lastLoginAt: new Date() })
    .where(eq(platformUsers.id, user.id));

  return {
    accessToken,
    refreshToken: rawRefreshToken,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
    },
  };
}

/**
 * Exchange a refresh token for a new access token.
 * Filters on tokenPrefix first so the argon2 scan is bounded to ~1 row.
 */
export async function refreshPlatformToken(
  app: FastifyInstance,
  rawRefreshToken: string,
): Promise<{ accessToken: string }> {
  const candidates = await db
    .select()
    .from(platformSessions)
    .where(
      and(
        eq(platformSessions.tokenPrefix, rawRefreshToken.slice(0, TOKEN_PREFIX_LEN)),
        gt(platformSessions.expiresAt, new Date()),
        isNull(platformSessions.revokedAt),
      ),
    );

  let matched: (typeof candidates)[number] | undefined;
  for (const session of candidates) {
    if (await argon2.verify(session.tokenHash, rawRefreshToken)) {
      matched = session;
      break;
    }
  }

  if (!matched) {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }

  const [user] = await db
    .select()
    .from(platformUsers)
    .where(and(eq(platformUsers.id, matched.platformUserId), eq(platformUsers.isActive, true)))
    .limit(1);

  if (!user) {
    throw new UnauthorizedError('Platform account is no longer active');
  }

  const payload: PlatformJwtPayload = {
    sub: user.id,
    role: user.role,
    email: user.email,
    aud: 'platform',
    type: 'access',
  };

  return {
    accessToken: signPlatformToken(app, payload, env.JWT_PLATFORM_ACCESS_EXPIRY),
  };
}

// ─── MFA enrolment ───────────────────────────────────────────────────────────

/**
 * Step 1 of enrolment: mint a secret and return the provisioning URI.
 * Stores the encrypted secret but leaves mfaEnabledAt null — MFA is not yet
 * in force, so a user who scans the QR and then loses their phone is not
 * locked out of an account that never completed enrolment.
 */
export async function beginMfaEnrolment(platformUserId: string): Promise<{ uri: string }> {
  const [user] = await db
    .select({ id: platformUsers.id, email: platformUsers.email })
    .from(platformUsers)
    .where(eq(platformUsers.id, platformUserId))
    .limit(1);

  if (!user) {
    throw new UnauthorizedError('Platform account no longer exists');
  }

  const { secretEncrypted, uri } = createTotpEnrolment(user.email);

  await db
    .update(platformUsers)
    .set({ mfaSecretEncrypted: secretEncrypted, mfaEnabledAt: null, updatedAt: new Date() })
    .where(eq(platformUsers.id, user.id));

  return { uri };
}

/**
 * Step 2: the user proves possession of the secret. Only now does MFA
 * become active for the account.
 */
export async function confirmMfaEnrolment(
  platformUserId: string,
  code: string,
): Promise<{ enabled: true }> {
  const [user] = await db
    .select({ id: platformUsers.id, mfaSecretEncrypted: platformUsers.mfaSecretEncrypted })
    .from(platformUsers)
    .where(eq(platformUsers.id, platformUserId))
    .limit(1);

  if (!user?.mfaSecretEncrypted) {
    throw new UnauthorizedError('No MFA enrolment in progress. Call /mfa/setup first.');
  }

  const secret = decrypt(user.mfaSecretEncrypted);
  if (!(await verifyTotpPlain(secret, code, user.id))) {
    throw new UnauthorizedError('Invalid MFA code');
  }

  await db
    .update(platformUsers)
    .set({ mfaEnabledAt: new Date(), updatedAt: new Date() })
    .where(eq(platformUsers.id, user.id));

  return { enabled: true };
}

export async function revokePlatformSession(rawRefreshToken: string): Promise<void> {
  const candidates = await db
    .select()
    .from(platformSessions)
    .where(
      and(
        eq(platformSessions.tokenPrefix, rawRefreshToken.slice(0, TOKEN_PREFIX_LEN)),
        isNull(platformSessions.revokedAt),
      ),
    );

  for (const session of candidates) {
    if (await argon2.verify(session.tokenHash, rawRefreshToken)) {
      await db
        .update(platformSessions)
        .set({ revokedAt: new Date() })
        .where(eq(platformSessions.id, session.id));
      return;
    }
  }
}
