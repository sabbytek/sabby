/**
 * TOTP (RFC 6238) for platform-user MFA.
 *
 * The shared secret is stored AES-256-GCM encrypted in
 * platform_users.mfa_secret_encrypted and only decrypted in memory at
 * verification time — the same handling the logistics provider API keys get.
 */

import { createHash } from 'crypto';
import { TOTP, NobleCryptoPlugin, ScureBase32Plugin } from 'otplib';
import { encrypt, decrypt } from '../../../shared/crypto/encrypt.js';
import { cache } from '../../../shared/cache/client.js';

const totp = new TOTP({
  crypto: new NobleCryptoPlugin(),
  base32: new ScureBase32Plugin(),
});

/**
 * Accept codes one step either side of now (±30s). Authenticator apps and
 * phones drift; without this, a correct code is rejected often enough that
 * operators start disabling MFA, which is the worse outcome.
 */
const EPOCH_TOLERANCE_SECONDS = 30;

const ISSUER = 'BPOS Platform';

/**
 * How long a spent code stays spent: the 30s step plus the tolerance either
 * side, which is the whole span over which the same digits would still verify.
 */
const REPLAY_WINDOW_SECONDS = 30 + 2 * EPOCH_TOLERANCE_SECONDS;

/**
 * Consumes a code, returning false if it has already been used.
 *
 * RFC 6238 §5.2: a code must be accepted once. Without this, a code observed
 * over the operator's shoulder or lifted from a phishing proxy stays usable
 * for the rest of its window — the password is already compromised in the
 * scenarios MFA exists for, so the second factor has to be genuinely
 * one-time.
 *
 * Redis rather than memory because the admin plane runs more than one
 * instance, and a guard only one instance knows about is not a guard.
 *
 * Only the digest is stored: a live code is a credential, and the cache is
 * not where credentials belong.
 */
async function claimCode(identity: string, code: string): Promise<boolean> {
  const digest = createHash('sha256').update(`${identity}:${code.trim()}`).digest('hex');

  try {
    // SET NX is the atomic part — two requests racing the same code, on two
    // instances, cannot both win.
    const claimed = await cache.set(
      `platform:totp:used:${digest}`,
      '1',
      'EX',
      REPLAY_WINDOW_SECONDS,
      'NX',
    );
    return claimed === 'OK';
  } catch (error) {
    // Deliberately fails OPEN. Failing closed would lock every MFA-required
    // admin out of the plane whenever Redis blips — including the people who
    // would fix Redis — to defend a 90-second replay window that needs the
    // code to have been intercepted already. This is no weaker than the
    // no-guard behaviour it replaces, but it is a real gap, so it is loud.
    console.error(
      'TOTP replay guard unavailable — code accepted without single-use check:',
      error instanceof Error ? error.message : error,
    );
    return true;
  }
}

export interface TotpEnrolment {
  /** Base32 secret, encrypted — store this on the user row. */
  secretEncrypted: string;
  /** otpauth:// URI to render as a QR code. Contains the PLAINTEXT secret. */
  uri: string;
}

/**
 * Begin enrolment: mint a secret and the provisioning URI.
 * The caller must not persist mfaEnabledAt until the user proves possession
 * by submitting a valid code (see confirmTotpEnrolment in service.ts).
 */
export function createTotpEnrolment(email: string): TotpEnrolment {
  const secret = totp.generateSecret();
  return {
    secretEncrypted: encrypt(secret),
    uri: totp.toURI({ secret, label: email, issuer: ISSUER }),
  };
}

/**
 * Verify a submitted code against an encrypted secret, and consume it.
 *
 * Returns false rather than throwing for any malformed input — otplib throws
 * TokenLengthError/TokenFormatError on junk, and a guard must fail closed,
 * not 500.
 *
 * `identity` scopes the single-use record, so one admin's code never blocks
 * another's. Pass the platform user id.
 */
export async function verifyTotp(
  secretEncrypted: string,
  code: string,
  identity: string,
): Promise<boolean> {
  let valid: boolean;

  try {
    const secret = decrypt(secretEncrypted);
    const result = await totp.verify(code.trim(), {
      secret,
      epochTolerance: EPOCH_TOLERANCE_SECONDS,
    });
    valid = result.valid;
  } catch {
    return false;
  }

  // Only correct codes are consumed — a wrong guess must not be able to burn
  // the real code the user is about to type.
  return valid ? claimCode(identity, code) : false;
}

/**
 * Verify a code against a plaintext secret (enrolment confirmation only).
 *
 * Consumes the code like verifyTotp does, which means the code that confirms
 * enrolment cannot also be the code that logs in — correct, and worth knowing
 * when reading the 'Invalid MFA code' that follows a fast login attempt.
 */
export async function verifyTotpPlain(
  secret: string,
  code: string,
  identity: string,
): Promise<boolean> {
  let valid: boolean;

  try {
    const result = await totp.verify(code.trim(), {
      secret,
      epochTolerance: EPOCH_TOLERANCE_SECONDS,
    });
    valid = result.valid;
  } catch {
    return false;
  }

  return valid ? claimCode(identity, code) : false;
}
