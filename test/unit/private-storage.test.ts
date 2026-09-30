import { describe, it, expect, vi, beforeEach } from 'vitest';

const r2 = vi.hoisted(() => ({
  uploadPrivateToR2: vi.fn().mockResolvedValue(undefined),
  signR2Url: vi.fn(async (key: string) => `https://r2.signed/${key}?sig=1`),
}));
const neon = vi.hoisted(() => ({
  uploadToNeon: vi.fn().mockResolvedValue(undefined),
  signNeonUrl: vi.fn(async (key: string) => `https://neon.signed/${key}?sig=1`),
}));
const envMock = vi.hoisted(() => {
  const provider: 'r2' | 'neon' = 'r2';
  return { env: { PRIVATE_STORAGE_PROVIDER: provider } };
});

vi.mock('../../src/shared/storage/r2.js', () => r2);
vi.mock('../../src/shared/storage/neon.js', () => neon);
vi.mock('../../src/config/env.js', () => envMock);

import { uploadPrivate, resolveFileUrl } from '../../src/shared/storage/private.js';

const file = { key: 't_abc/receipts/1.jpg', body: Buffer.from('x'), contentType: 'image/jpeg' };

describe('private storage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    envMock.env.PRIVATE_STORAGE_PROVIDER = 'r2';
  });

  it('uploads to R2 and returns an r2:// reference by default', async () => {
    await expect(uploadPrivate(file)).resolves.toBe('r2://t_abc/receipts/1.jpg');
    expect(r2.uploadPrivateToR2).toHaveBeenCalledWith(file);
    expect(neon.uploadToNeon).not.toHaveBeenCalled();
  });

  it('uploads to Neon when PRIVATE_STORAGE_PROVIDER=neon', async () => {
    envMock.env.PRIVATE_STORAGE_PROVIDER = 'neon';
    await expect(uploadPrivate(file)).resolves.toBe('neon://t_abc/receipts/1.jpg');
    expect(neon.uploadToNeon).toHaveBeenCalledWith(file);
    expect(r2.uploadPrivateToR2).not.toHaveBeenCalled();
  });

  it('signs each reference with the provider it names, whatever the current setting', async () => {
    envMock.env.PRIVATE_STORAGE_PROVIDER = 'r2';
    await expect(resolveFileUrl('neon://t_abc/invoices/i.pdf', 't_abc')).resolves.toBe(
      'https://neon.signed/t_abc/invoices/i.pdf?sig=1',
    );
    await expect(resolveFileUrl('r2://t_abc/invoices/i.pdf', 't_abc')).resolves.toBe(
      'https://r2.signed/t_abc/invoices/i.pdf?sig=1',
    );
  });

  it("refuses to sign another tenant's object", async () => {
    await expect(resolveFileUrl('r2://t_other/receipts/1.jpg', 't_abc')).resolves.toBeNull();
    // A prefix match on the schema name alone is not enough.
    await expect(resolveFileUrl('r2://t_abcdef/receipts/1.jpg', 't_abc')).resolves.toBeNull();
    expect(r2.signR2Url).not.toHaveBeenCalled();
  });

  it('passes public/legacy URLs and null through unchanged', async () => {
    const url = 'https://files.example.com/t_abc/uploads/a.jpg';
    await expect(resolveFileUrl(url, 't_abc')).resolves.toBe(url);
    await expect(resolveFileUrl(null, 't_abc')).resolves.toBeNull();
    expect(r2.signR2Url).not.toHaveBeenCalled();
  });
});
