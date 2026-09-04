/**
 * TOTP (RFC 6238) and base32 (RFC 4648) primitives for platform MFA.
 *
 * Deliberately dependency-free: TOTP is a small, well-specified algorithm and
 * Node's crypto gives us HMAC-SHA1 and a constant-time comparison. Correctness
 * is pinned by the RFC 6238 test vectors in totp.test.ts.
 *
 * Defaults match what Google Authenticator, Authy, and 1Password expect:
 * SHA-1, 6 digits, 30-second step.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const DEFAULT_DIGITS = 6;
const DEFAULT_STEP_SECONDS = 30;

/** Encodes bytes to an unpadded RFC 4648 base32 string (authenticator format). */
export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET.charAt((value >>> (bits - 5)) & 31);
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET.charAt((value << (5 - bits)) & 31);
  }
  return output;
}

/** Decodes an RFC 4648 base32 string (padding and casing tolerant). */
export function base32Decode(input: string): Buffer {
  const cleaned = input.replace(/=+$/g, '').replace(/\s+/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of cleaned) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) {
      throw new Error('Invalid base32 character in TOTP secret');
    }
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** Generates a new random base32 TOTP secret (default 20 bytes / 160 bits). */
export function generateTotpSecret(byteLength = 20): string {
  return base32Encode(randomBytes(byteLength));
}

/**
 * Computes the TOTP code for a given secret at a given time.
 * Exported mainly so tests can assert against RFC 6238 vectors.
 */
export function generateTotp(
  secretBase32: string,
  atMs: number = Date.now(),
  opts: { digits?: number; stepSeconds?: number } = {},
): string {
  const digits = opts.digits ?? DEFAULT_DIGITS;
  const stepSeconds = opts.stepSeconds ?? DEFAULT_STEP_SECONDS;
  const counter = Math.floor(atMs / 1000 / stepSeconds);

  const counterBuf = Buffer.alloc(8);
  // 64-bit big-endian counter. Bit 31 shifts safely via division for the high word.
  counterBuf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  counterBuf.writeUInt32BE(counter % 0x100000000, 4);

  const hmac = createHmac('sha1', base32Decode(secretBase32)).update(counterBuf).digest();
  // RFC 6238 dynamic truncation: low nibble of the last byte is the offset.
  const offset = hmac.readUInt8(hmac.length - 1) & 0x0f;
  const binary = hmac.readUInt32BE(offset) & 0x7fffffff;

  return (binary % 10 ** digits).toString().padStart(digits, '0');
}

/**
 * Verifies a user-supplied TOTP token against a secret.
 * `window` allows +/- N steps of clock drift (default 1 = +/-30s).
 * Comparison is constant-time to avoid leaking timing information.
 */
export function verifyTotp(
  secretBase32: string,
  token: string,
  opts: { window?: number; digits?: number; stepSeconds?: number; atMs?: number } = {},
): boolean {
  const window = opts.window ?? 1;
  const digits = opts.digits ?? DEFAULT_DIGITS;
  const stepSeconds = opts.stepSeconds ?? DEFAULT_STEP_SECONDS;
  const atMs = opts.atMs ?? Date.now();

  const normalized = token.replace(/\s+/g, '');
  if (!new RegExp(`^\\d{${String(digits)}}$`).test(normalized)) {
    return false;
  }

  for (let errorWindow = -window; errorWindow <= window; errorWindow++) {
    const candidate = generateTotp(secretBase32, atMs + errorWindow * stepSeconds * 1000, {
      digits,
      stepSeconds,
    });
    const a = Buffer.from(candidate);
    const b = Buffer.from(normalized);
    if (a.length === b.length && timingSafeEqual(a, b)) {
      return true;
    }
  }
  return false;
}

/** Builds the otpauth:// URI an authenticator app scans as a QR code. */
export function buildOtpauthUri(
  secretBase32: string,
  accountEmail: string,
  issuer: string,
): string {
  const label = encodeURIComponent(`${issuer}:${accountEmail}`);
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: 'SHA1',
    digits: String(DEFAULT_DIGITS),
    period: String(DEFAULT_STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
