import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { TOTP, NobleCryptoPlugin, ScureBase32Plugin } from 'otplib';

// TOTP secrets are stored AES-256-GCM encrypted, so these tests need the key.
beforeAll(() => {
  process.env['PLATFORM_ENCRYPTION_KEY'] = 'a'.repeat(64);
});

// ─── Redis stub ───────────────────────────────────────────────────────────────
//
// The replay guard is the thing under test, so it runs for real against an
// in-memory stand-in with SET NX semantics. `failing` flips the stub into the
// outage the guard is meant to survive.

const redis = {
  keys: new Map<string, string>(),
  failing: false,
};

vi.mock('../../src/shared/cache/client.js', () => ({
  cache: {
    set: (key: string, value: string, _ex: string, _ttl: number, nx?: string) => {
      if (redis.failing) return Promise.reject(new Error('Connection is closed.'));
      if (nx === 'NX' && redis.keys.has(key)) return Promise.resolve(null);
      redis.keys.set(key, value);
      return Promise.resolve('OK');
    },
  },
}));

beforeEach(() => {
  redis.keys.clear();
  redis.failing = false;
});

const totp = new TOTP({ crypto: new NobleCryptoPlugin(), base32: new ScureBase32Plugin() });

/** Enrol, and hand back both the stored ciphertext and a live code. */
async function enrol(email = 'admin@bpos.ng') {
  const { createTotpEnrolment } = await import('../../src/modules/platform/auth/totp.js');
  const { secretEncrypted, uri } = createTotpEnrolment(email);

  // Recover the plaintext secret from the provisioning URI to mint a code,
  // exactly as an authenticator app would.
  const secret = new URL(uri).searchParams.get('secret');
  expect(secret).toBeTruthy();

  return { secretEncrypted, secret: secret!, code: await totp.generate({ secret: secret! }) };
}

describe('platform TOTP', () => {
  it('accepts a freshly generated code', async () => {
    const { verifyTotp } = await import('../../src/modules/platform/auth/totp.js');
    const { secretEncrypted, code } = await enrol();

    expect(await verifyTotp(secretEncrypted, code, 'pu-1')).toBe(true);
  });

  it('rejects an incorrect code', async () => {
    const { createTotpEnrolment, verifyTotp } =
      await import('../../src/modules/platform/auth/totp.js');
    const { secretEncrypted } = createTotpEnrolment('admin@bpos.ng');
    expect(await verifyTotp(secretEncrypted, '000000', 'pu-1')).toBe(false);
  });

  it('fails closed on malformed input rather than throwing', async () => {
    // otplib throws TokenLengthError/TokenFormatError on junk. A guard that
    // propagates that would 500 instead of denying — it must return false.
    const { createTotpEnrolment, verifyTotp } =
      await import('../../src/modules/platform/auth/totp.js');
    const { secretEncrypted } = createTotpEnrolment('admin@bpos.ng');

    for (const junk of ['', 'abc', 'abcdef', '12345', '1234567', '../../etc', '000 000']) {
      await expect(verifyTotp(secretEncrypted, junk, 'pu-1')).resolves.toBe(false);
    }
  });

  it('fails closed when the stored secret is not decryptable', async () => {
    const { verifyTotp } = await import('../../src/modules/platform/auth/totp.js');
    expect(await verifyTotp('not-a-valid-ciphertext', '123456', 'pu-1')).toBe(false);
  });

  it('does not store the secret in plaintext', async () => {
    const { createTotpEnrolment } = await import('../../src/modules/platform/auth/totp.js');
    const { secretEncrypted, uri } = createTotpEnrolment('admin@bpos.ng');
    const plaintext = new URL(uri).searchParams.get('secret')!;
    expect(secretEncrypted).not.toContain(plaintext);
  });

  it('issues a distinct secret per enrolment', async () => {
    const { createTotpEnrolment } = await import('../../src/modules/platform/auth/totp.js');
    const a = new URL(createTotpEnrolment('a@bpos.ng').uri).searchParams.get('secret');
    const b = new URL(createTotpEnrolment('b@bpos.ng').uri).searchParams.get('secret');
    expect(a).not.toBe(b);
  });
});

// ─── Single-use enforcement ───────────────────────────────────────────────────

describe('TOTP replay', () => {
  it('accepts a code once and rejects the same code again', async () => {
    const { verifyTotp } = await import('../../src/modules/platform/auth/totp.js');
    const { secretEncrypted, code } = await enrol();

    expect(await verifyTotp(secretEncrypted, code, 'pu-1')).toBe(true);
    // Still inside its validity window — cryptographically fine, and that is
    // exactly the replay this guard exists to stop.
    expect(await verifyTotp(secretEncrypted, code, 'pu-1')).toBe(false);
  });

  it('rejects a replay of the same code with surrounding whitespace', async () => {
    const { verifyTotp } = await import('../../src/modules/platform/auth/totp.js');
    const { secretEncrypted, code } = await enrol();

    expect(await verifyTotp(secretEncrypted, code, 'pu-1')).toBe(true);
    expect(await verifyTotp(secretEncrypted, ` ${code} `, 'pu-1')).toBe(false);
  });

  it('scopes consumption per user — one admin cannot burn another admin’s code', async () => {
    const { verifyTotp } = await import('../../src/modules/platform/auth/totp.js');
    const { secretEncrypted, code } = await enrol();

    expect(await verifyTotp(secretEncrypted, code, 'pu-1')).toBe(true);
    expect(await verifyTotp(secretEncrypted, code, 'pu-2')).toBe(true);
  });

  it('does not consume a code that failed verification', async () => {
    const { verifyTotp } = await import('../../src/modules/platform/auth/totp.js');
    const { secretEncrypted, code } = await enrol();

    // A wrong guess must not be able to burn the code the user is about to type.
    expect(await verifyTotp(secretEncrypted, '000000', 'pu-1')).toBe(false);
    expect(await verifyTotp(secretEncrypted, code, 'pu-1')).toBe(true);
  });

  it('consumes enrolment-confirmation codes too', async () => {
    const { verifyTotpPlain } = await import('../../src/modules/platform/auth/totp.js');
    const { secret, code } = await enrol();

    expect(await verifyTotpPlain(secret, code, 'pu-1')).toBe(true);
    expect(await verifyTotpPlain(secret, code, 'pu-1')).toBe(false);
  });

  it('stores only a digest of the code, never the code itself', async () => {
    const { verifyTotp } = await import('../../src/modules/platform/auth/totp.js');
    const { secretEncrypted, code } = await enrol();

    await verifyTotp(secretEncrypted, code, 'pu-1');

    expect(redis.keys.size).toBe(1);
    for (const key of redis.keys.keys()) {
      expect(key).not.toContain(code);
    }
  });

  it('fails open when Redis is unreachable', async () => {
    // A documented trade-off, asserted so it cannot change silently: a Redis
    // outage must not lock every MFA-required admin out of the platform.
    const { verifyTotp } = await import('../../src/modules/platform/auth/totp.js');
    const { secretEncrypted, code } = await enrol();
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    redis.failing = true;
    expect(await verifyTotp(secretEncrypted, code, 'pu-1')).toBe(true);
    expect(errors).toHaveBeenCalled();

    errors.mockRestore();
  });
});
