/**
 * Neon object storage (S3-compatible). Used for private files when
 * PRIVATE_STORAGE_PROVIDER=neon — see private.ts. Objects are never public.
 */

import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../../config/env.js';
import { ExternalServiceError } from '../errors/types.js';

let _client: S3Client | null = null;

function getClient(): S3Client {
  if (!env.AWS_ENDPOINT_URL_S3 || !env.AWS_ACCESS_KEY_ID || !env.AWS_SECRET_ACCESS_KEY) {
    throw new ExternalServiceError('Neon storage', 'Not configured (AWS_ENDPOINT_URL_S3 and keys)');
  }
  // Explicit config rather than the SDK's implicit AWS_* lookup, so this
  // client and the R2 client can never pick up each other's settings.
  _client ??= new S3Client({
    endpoint: env.AWS_ENDPOINT_URL_S3,
    region: env.AWS_REGION,
    forcePathStyle: true,
    credentials: {
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    },
  });
  return _client;
}

function toServiceError(err: unknown, fallback: string): ExternalServiceError {
  if (err instanceof ExternalServiceError) return err;
  return new ExternalServiceError('Neon storage', err instanceof Error ? err.message : fallback);
}

export async function uploadToNeon(input: {
  key: string;
  body: Buffer;
  contentType: string;
}): Promise<void> {
  try {
    await getClient().send(
      new PutObjectCommand({
        Bucket: env.NEON_STORAGE_BUCKET,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
      }),
    );
  } catch (err) {
    throw toServiceError(err, 'Upload failed');
  }
}

export async function signNeonUrl(key: string, expiresIn: number): Promise<string> {
  try {
    return await getSignedUrl(
      getClient(),
      new GetObjectCommand({ Bucket: env.NEON_STORAGE_BUCKET, Key: key }),
      { expiresIn },
    );
  } catch (err) {
    throw toServiceError(err, 'Signing failed');
  }
}
