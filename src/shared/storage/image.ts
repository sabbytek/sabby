import sharp from 'sharp';

const MAX_DIMENSION_PX = 1600;
const JPEG_QUALITY = 80;

export interface CompressedImage {
  buffer: Buffer;
  contentType: string;
  extension: string;
}

export async function compressImage(buffer: Buffer): Promise<CompressedImage> {
  const compressed = await sharp(buffer)
    .rotate()
    .resize({
      width: MAX_DIMENSION_PX,
      height: MAX_DIMENSION_PX,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toBuffer();

  return { buffer: compressed, contentType: 'image/jpeg', extension: 'jpg' };
}
