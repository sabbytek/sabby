/**
 * Private files (invoice PDFs, expense receipts). Never publicly readable:
 * callers store the reference returned by uploadPrivate() and turn it into a
 * short-lived signed URL with resolveFileUrl() when serving it.
 *
 * PRIVATE_STORAGE_PROVIDER picks where new files go:
 *   r2   — Cloudflare R2 (R2_PRIVATE_BUCKET_NAME), same account as public images
 *   neon — Neon object storage (AWS_ENDPOINT_URL_S3 …)
 * References carry their provider (`r2://key`, `neon://key`), so files stored
 * before a switch still resolve afterwards, as long as that provider's
 * credentials remain configured.
 */

import { env } from '../../config/env.js';
import { signNeonUrl, uploadToNeon } from './neon.js';
import { signR2Url, uploadPrivateToR2 } from './r2.js';

/** How long a signed download link stays valid. */
export const SIGNED_URL_TTL_SECONDS = 60 * 60;

const providers = {
  r2: { upload: uploadPrivateToR2, sign: signR2Url },
  neon: { upload: uploadToNeon, sign: signNeonUrl },
} as const;

type Provider = keyof typeof providers;

function parseRef(stored: string): { provider: Provider; key: string } | null {
  const match = /^(r2|neon):\/\/(.+)$/.exec(stored);
  return match ? { provider: match[1] as Provider, key: match[2]! } : null;
}

export interface UploadPrivateInput {
  /** Must start with the tenant's schema name, e.g. `t_xxx/receipts/<uuid>.jpg`. */
  key: string;
  body: Buffer;
  contentType: string;
}

/** Uploads a private object and returns the reference to store, e.g. `r2://<key>`. */
export async function uploadPrivate(input: UploadPrivateInput): Promise<string> {
  const provider = env.PRIVATE_STORAGE_PROVIDER;
  await providers[provider].upload(input);
  return `${provider}://${input.key}`;
}

/**
 * Turns a stored file reference into something a client can open.
 * - `r2://<key>` / `neon://<key>` → signed URL, but only if the key belongs to
 *   `schemaName`; a reference to another tenant's object (e.g. pasted into
 *   receiptUrl) is treated as absent rather than signed.
 * - Anything else (public R2 URLs, external links) is returned unchanged.
 */
export async function resolveFileUrl(
  stored: string | null,
  schemaName: string,
): Promise<string | null> {
  if (!stored) return stored;
  const ref = parseRef(stored);
  if (!ref) return stored;
  if (!ref.key.startsWith(`${schemaName}/`)) return null;
  return providers[ref.provider].sign(ref.key, SIGNED_URL_TTL_SECONDS);
}
