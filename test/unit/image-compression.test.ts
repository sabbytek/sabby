import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { compressImage } from '../../src/shared/storage/image.js';

describe('compressImage', () => {
  it('shrinks a large image and re-encodes it as JPEG', async () => {
    const source = await sharp({
      create: { width: 2000, height: 2000, channels: 3, background: 'red' },
    })
      .jpeg()
      .toBuffer();

    const result = await compressImage(source);

    expect(result.contentType).toBe('image/jpeg');
    expect(result.extension).toBe('jpg');
    expect(result.buffer.length).toBeLessThan(source.length);

    const metadata = await sharp(result.buffer).metadata();
    expect(metadata.format).toBe('jpeg');
    expect(metadata.width).toBeLessThanOrEqual(1600);
    expect(metadata.height).toBeLessThanOrEqual(1600);
  });

  it('does not upscale an image smaller than the max dimension', async () => {
    const source = await sharp({
      create: { width: 400, height: 300, channels: 3, background: 'blue' },
    })
      .png()
      .toBuffer();

    const result = await compressImage(source);

    const metadata = await sharp(result.buffer).metadata();
    expect(metadata.width).toBe(400);
    expect(metadata.height).toBe(300);
  });
});
