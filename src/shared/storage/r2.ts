import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../../config/env.js';
import { ExternalServiceError } from '../errors/types.js';

const s3Client = new S3Client({
  region: 'auto',
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
});

export interface UploadToR2Input {
  key: string;
  body: Buffer;
  contentType: string;
}

/** Public upload: returns a permanent URL under R2_PUBLIC_URL. */
export async function uploadToR2(input: UploadToR2Input): Promise<string> {
  await putObject(env.R2_BUCKET_NAME, input);
  return `${env.R2_PUBLIC_URL}/${input.key}`;
}

// ─── Private objects (PRIVATE_STORAGE_PROVIDER=r2, see private.ts) ───────────
// Stored in R2_PRIVATE_BUCKET_NAME, which should have no public access or
// custom domain; served only through signed URLs from R2's S3 API.

function privateBucket(): string {
  return env.R2_PRIVATE_BUCKET_NAME ?? env.R2_BUCKET_NAME;
}

export async function uploadPrivateToR2(input: UploadToR2Input): Promise<void> {
  await putObject(privateBucket(), input);
}

export async function signR2Url(key: string, expiresIn: number): Promise<string> {
  try {
    return await getSignedUrl(s3Client, new GetObjectCommand({ Bucket: privateBucket(), Key: key }), {
      expiresIn,
    });
  } catch (err) {
    throw new ExternalServiceError('R2', err instanceof Error ? err.message : 'Signing failed');
  }
}

async function putObject(bucket: string, input: UploadToR2Input): Promise<void> {
  try {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
      }),
    );
  } catch (err) {
    throw new ExternalServiceError('R2', err instanceof Error ? err.message : 'Upload failed');
  }
}
