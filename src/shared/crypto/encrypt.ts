import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { env } from '../../config/env.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LEN = 12;    // 96-bit IV recommended for GCM
const TAG_LEN = 16;   // 128-bit auth tag

function getKey(): Buffer {
  const hex = env.PLATFORM_ENCRYPTION_KEY;
  if (!hex) throw new Error('PLATFORM_ENCRYPTION_KEY is not set');
  const key = Buffer.from(hex, 'hex');
  if (key.length !== 32) throw new Error('PLATFORM_ENCRYPTION_KEY must be 32 bytes (64 hex chars)');
  return key;
}

// Encrypts plaintext with AES-256-GCM.
// Output format (base64): iv(12) + tag(16) + ciphertext
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString('base64');
}

// Decrypts a base64 blob produced by encrypt().
export function decrypt(blob: string): string {
  const key = getKey();
  const buf = Buffer.from(blob, 'base64');
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ciphertext = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
