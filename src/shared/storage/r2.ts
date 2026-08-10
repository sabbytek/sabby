import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
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

export async function uploadToR2(input: UploadToR2Input): Promise<string> {
  try {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: env.R2_BUCKET_NAME,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
      }),
    );
  } catch (err) {
    throw new ExternalServiceError('R2', err instanceof Error ? err.message : 'Upload failed');
  }
  return `${env.R2_PUBLIC_URL}/${input.key}`;
}
