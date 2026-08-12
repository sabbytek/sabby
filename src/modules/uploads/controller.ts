import type { RequestContext } from '../../shared/types/controller.js';
import { uploadImage } from './service.js';

export async function upload(
  ctx: RequestContext,
  input: { buffer: Buffer; mimeType: string },
): Promise<unknown> {
  const result = await uploadImage(ctx.schema, input);
  return result;
}
