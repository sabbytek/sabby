import type { RequestContext } from '../../shared/types/controller.js';
import { uploadImage, type UploadVisibility } from './service.js';

export async function upload(ctx: RequestContext, input: { buffer: Buffer; mimeType: string; visibility?: UploadVisibility }) {
  return uploadImage(ctx.schema, input);
}
