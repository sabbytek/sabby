import argon2 from 'argon2';
import { v4 as uuidv4 } from 'uuid';
import { eq, and, gt, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { db } from '../../shared/db/client.js';
import { platformUsers, platformRefreshTokens } from '../../shared/db/schema/public.js';
import { UnauthorizedError, NotFoundError, ValidationError } from '../../shared/errors/types.js';
import type { PlatformJwtPayload, PlatformRole } from '../../shared/types/index.js';
import { encrypt, decrypt } from '../../shared/crypto/encrypt.js';
import { generateTotpSecret, verifyTotp, buildOtpauthUri } from '../../shared/crypto/totp.js';
import { env } from '../../config/env.js';

const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// The platform signer is the namespaced @fastify/jwt instance registered in
// app.ts. Its `sign` already applies the platform expiry, audience, and issuer.
interface PlatformSigner {
  sign(payload: PlatformJwtPayload): string;
}

function platformSigner(app: FastifyInstance): PlatformSigner {
  return (app.jwt as unknown as { platform: PlatformSigner }).platform;
}

function signAccessToken(
  app: FastifyInstance,
  user: {
    id: string;
    email: string;
    role: PlatformRole;
  },
): string {
  return platformSigner(app).sign({
    sub: user.id,
    role: user.role,
    email: user.email,
    type: 'access',
  });
}

async function issueRefreshToken(platformUserId: string): Promise<string> {
  const raw = uuidv4() + uuidv4(); // 64 hex chars of entropy
  const tokenHash = await argon2.hash(raw);
  await db.insert(platformRefreshTokens).values({
    id: uuidv4(),
    platformUserId,
    tokenHash,
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
  });
  return raw;
}

export interface PlatformLoginResult {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: PlatformRole;
  };
  mfaEnrollmentRequired: boolean;
}

/**
 * Authenticates a platform user. If the user has MFA enabled, a valid TOTP
 * code is required in the same call. Users without MFA enrolled can log in but
 * are flagged so the console can force enrollment.
 */
export async function loginPlatformUser(
  app: FastifyInstance,
  input: { email: string; password: string; totp?: string },
): Promise<PlatformLoginResult> {
  const [user] = await db
    .select()
    .from(platformUsers)
    .where(
      and(eq(platformUsers.email, input.email.toLowerCase()), eq(platformUsers.isActive, true)),
    )
    .limit(1);

  // Verify a hash even when the user is missing, to keep timing uniform.
  const hash = user?.passwordHash ?? '$argon2id$v=19$m=65536,t=3,p=4$notarealsalt$notarealhash';
  const passwordValid = await argon2.verify(hash, input.password).catch(() => false);
  if (!user || !passwordValid) {
    throw new UnauthorizedError('Invalid email or password');
  }

  if (user.mfaEnabled) {
    if (!input.totp) {
      throw new UnauthorizedError('MFA code required');
    }
    if (!user.mfaSecretEncrypted || !verifyTotp(decrypt(user.mfaSecretEncrypted), input.totp)) {
      throw new UnauthorizedError('Invalid MFA code');
    }
  }

  const accessToken = signAccessToken(app, {
    id: user.id,
    email: user.email,
    role: user.role,
  });
  const refreshToken = await issueRefreshToken(user.id);

  await db
    .update(platformUsers)
    .set({ lastLoginAt: new Date() })
    .where(eq(platformUsers.id, user.id));

  return {
    accessToken,
    refreshToken,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    mfaEnrollmentRequired: !user.mfaEnabled,
  };
}

/**
 * Rotates a platform refresh token: the presented token is revoked and a fresh
 * access + refresh pair is issued. A replayed (already-revoked) token fails.
 */
export async function refreshPlatformSession(
  app: FastifyInstance,
  rawRefreshToken: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const now = new Date();
  const candidates = await db
    .select()
    .from(platformRefreshTokens)
    .where(and(gt(platformRefreshTokens.expiresAt, now), isNull(platformRefreshTokens.revokedAt)));

  let matched: (typeof candidates)[number] | undefined;
  for (const token of candidates) {
    if (await argon2.verify(token.tokenHash, rawRefreshToken).catch(() => false)) {
      matched = token;
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
    throw new UnauthorizedError('Platform user is inactive');
  }

  await db
    .update(platformRefreshTokens)
    .set({ revokedAt: now })
    .where(eq(platformRefreshTokens.id, matched.id));

  const accessToken = signAccessToken(app, {
    id: user.id,
    email: user.email,
    role: user.role,
  });
  const refreshToken = await issueRefreshToken(user.id);
  return { accessToken, refreshToken };
}

export async function revokePlatformRefreshToken(rawRefreshToken: string): Promise<void> {
  const candidates = await db
    .select()
    .from(platformRefreshTokens)
    .where(isNull(platformRefreshTokens.revokedAt));
  for (const token of candidates) {
    if (await argon2.verify(token.tokenHash, rawRefreshToken).catch(() => false)) {
      await db
        .update(platformRefreshTokens)
        .set({ revokedAt: new Date() })
        .where(eq(platformRefreshTokens.id, token.id));
      return;
    }
  }
}

export async function getPlatformUserById(id: string): Promise<{
  id: string;
  email: string;
  name: string;
  role: PlatformRole;
  mfaEnabled: boolean;
}> {
  const [user] = await db
    .select()
    .from(platformUsers)
    .where(and(eq(platformUsers.id, id), eq(platformUsers.isActive, true)))
    .limit(1);
  if (!user) throw new NotFoundError('Platform user', id);
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    mfaEnabled: user.mfaEnabled,
  };
}

// ─── MFA enrollment ─────────────────────────────────────────────────────────

/**
 * Starts TOTP enrollment: generates a secret, stores it encrypted, and returns
 * the provisioning URI. MFA is not active until confirmed with a valid code.
 */
export async function beginMfaEnrollment(
  userId: string,
): Promise<{ secret: string; otpauthUri: string }> {
  const [user] = await db
    .select({
      id: platformUsers.id,
      email: platformUsers.email,
      mfaEnabled: platformUsers.mfaEnabled,
    })
    .from(platformUsers)
    .where(and(eq(platformUsers.id, userId), eq(platformUsers.isActive, true)))
    .limit(1);
  if (!user) throw new NotFoundError('Platform user', userId);
  if (user.mfaEnabled) {
    throw new ValidationError('MFA is already enabled for this account');
  }

  const secret = generateTotpSecret();
  await db
    .update(platformUsers)
    .set({ mfaSecretEncrypted: encrypt(secret), updatedAt: new Date() })
    .where(eq(platformUsers.id, userId));

  return { secret, otpauthUri: buildOtpauthUri(secret, user.email, env.PLATFORM_MFA_ISSUER) };
}

/** Confirms enrollment: verifies a code against the pending secret and enables MFA. */
export async function confirmMfaEnrollment(userId: string, totp: string): Promise<void> {
  const [user] = await db
    .select({ id: platformUsers.id, mfaSecretEncrypted: platformUsers.mfaSecretEncrypted })
    .from(platformUsers)
    .where(and(eq(platformUsers.id, userId), eq(platformUsers.isActive, true)))
    .limit(1);
  if (!user) throw new NotFoundError('Platform user', userId);
  if (!user.mfaSecretEncrypted) {
    throw new ValidationError('No MFA enrollment in progress. Start enrollment first.');
  }
  if (!verifyTotp(decrypt(user.mfaSecretEncrypted), totp)) {
    throw new UnauthorizedError('Invalid MFA code');
  }
  await db
    .update(platformUsers)
    .set({ mfaEnabled: true, updatedAt: new Date() })
    .where(eq(platformUsers.id, userId));
}
