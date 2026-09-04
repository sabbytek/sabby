import { describe, it, expect } from 'vitest';
import {
  base32Encode,
  base32Decode,
  generateTotp,
  verifyTotp,
  generateTotpSecret,
  buildOtpauthUri,
} from '../../src/shared/crypto/totp.js';

// RFC 6238 test seed (SHA-1): ASCII "12345678901234567890".
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'));

describe('base32', () => {
  it('round-trips arbitrary bytes', () => {
    const buf = Buffer.from('the quick brown fox');
    expect(base32Decode(base32Encode(buf)).equals(buf)).toBe(true);
  });

  it('tolerates padding, whitespace, and lowercase on decode', () => {
    const encoded = base32Encode(Buffer.from('hello'));
    const messy = encoded.toLowerCase().split('').join(' ') + '==';
    expect(base32Decode(messy).toString()).toBe('hello');
  });
});

describe('generateTotp (RFC 6238 vectors, 6-digit SHA-1)', () => {
  // Truncated to 6 digits from the RFC Appendix B SHA-1 table.
  const vectors: Array<[number, string]> = [
    [59, '287082'],
    [1111111109, '081804'],
    [1111111111, '050471'],
    [1234567890, '005924'],
    [2000000000, '279037'],
    [20000000000, '353130'],
  ];

  for (const [seconds, expected] of vectors) {
    it(`T=${seconds}s -> ${expected}`, () => {
      expect(generateTotp(RFC_SECRET, seconds * 1000)).toBe(expected);
    });
  }
});

describe('verifyTotp', () => {
  it('accepts the current code', () => {
    const now = Date.now();
    expect(verifyTotp(RFC_SECRET, generateTotp(RFC_SECRET, now), { atMs: now })).toBe(true);
  });

  it('accepts a code one step in the past within the drift window', () => {
    const now = Date.now();
    const previous = generateTotp(RFC_SECRET, now - 30_000);
    expect(verifyTotp(RFC_SECRET, previous, { atMs: now, window: 1 })).toBe(true);
  });

  it('rejects a code outside the drift window', () => {
    const now = Date.now();
    const stale = generateTotp(RFC_SECRET, now - 120_000);
    expect(verifyTotp(RFC_SECRET, stale, { atMs: now, window: 1 })).toBe(false);
  });

  it('rejects malformed input', () => {
    expect(verifyTotp(RFC_SECRET, 'abcdef')).toBe(false);
    expect(verifyTotp(RFC_SECRET, '12345')).toBe(false);
    expect(verifyTotp(RFC_SECRET, '')).toBe(false);
  });
});

describe('secret + otpauth helpers', () => {
  it('generates a decodable base32 secret', () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]+$/);
    expect(base32Decode(secret).length).toBe(20);
  });

  it('builds a scannable otpauth URI', () => {
    const uri = buildOtpauthUri('JBSWY3DPEHPK3PXP', 'ops@sabby.example', 'Sabby Ops');
    expect(uri).toContain('otpauth://totp/');
    expect(uri).toContain('secret=JBSWY3DPEHPK3PXP');
    expect(uri).toContain('issuer=Sabby+Ops');
  });
});
