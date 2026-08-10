import { v4 as uuidv4 } from 'uuid';
import { compressImage } from '../../shared/storage/image.js';
import { uploadToR2 } from '../../shared/storage/r2.js';
import { ValidationError } from '../../shared/errors/types.js';

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export async function uploadImage(
  schemaName: string,
  input: { buffer: Buffer; mimeType: string },
): Promise<{ url: string }> {
  if (!ALLOWED_MIME_TYPES.has(input.mimeType)) {
    throw new ValidationError('Unsupported image type. Allowed: jpeg, png, webp');
  }

  const compressed = await compressImage(input.buffer);
  const key = `${schemaName}/uploads/${uuidv4()}.${compressed.extension}`;
  const url = await uploadToR2({
    key,
    body: compressed.buffer,
    contentType: compressed.contentType,
  });

  return { url };
}
