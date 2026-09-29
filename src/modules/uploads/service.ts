import { v4 as uuidv4 } from 'uuid';
import { compressImage } from '../../shared/storage/image.js';
import { uploadToR2 } from '../../shared/storage/r2.js';
import { uploadPrivate, resolveFileUrl } from '../../shared/storage/private.js';
import { ValidationError } from '../../shared/errors/types.js';

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export type UploadVisibility = 'public' | 'private';

/**
 * public  → Cloudflare R2, returns a permanent `url` (product photos).
 * private → PRIVATE_STORAGE_PROVIDER (R2 private bucket or Neon), returns `ref`
 *           to store (e.g. as an expense's receiptUrl) plus a short-lived
 *           signed `url` for an immediate preview.
 */
export async function uploadImage(
  schemaName: string,
  input: { buffer: Buffer; mimeType: string; visibility?: UploadVisibility },
): Promise<{ url: string; ref?: string }> {
  if (!ALLOWED_MIME_TYPES.has(input.mimeType)) {
    throw new ValidationError('Unsupported image type. Allowed: jpeg, png, webp');
  }

  const compressed = await compressImage(input.buffer);

  if (input.visibility === 'private') {
    const ref = await uploadPrivate({
      key: `${schemaName}/receipts/${uuidv4()}.${compressed.extension}`,
      body: compressed.buffer,
      contentType: compressed.contentType,
    });
    const url = await resolveFileUrl(ref, schemaName);
    return { url: url!, ref };
  }

  const key = `${schemaName}/uploads/${uuidv4()}.${compressed.extension}`;
  const url = await uploadToR2({
    key,
    body: compressed.buffer,
    contentType: compressed.contentType,
  });

  return { url };
}
