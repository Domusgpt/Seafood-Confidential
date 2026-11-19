import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { ImageError, MAX_UPLOAD_BYTES, formatProblem, processImage, renditionWidths } from './process';

// Story image processing (v0.7.0): bounded decoding, upright pixels, renditions that never upscale,
// and no metadata (camera details, GPS) in anything a reader downloads.

const photo = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: { r: 16, g: 43, b: 58 } } })
    .composite([
      {
        input: Buffer.from(
          `<svg width="${width}" height="${height}"><circle cx="${width / 3}" cy="${height / 2}" r="${height / 4}" fill="#B64D35"/></svg>`,
        ),
      },
    ])
    .jpeg({ quality: 90 });

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

describe('processImage', () => {
  it('makes AVIF and WebP renditions at the site widths up to the original, each named by its hash', async () => {
    const input = await photo(1000, 700).toBuffer();
    const out = await processImage(input);
    expect(out.width).toBe(1000);
    expect(out.height).toBe(700);
    expect(out.originalSha256).toBe(sha(input));
    expect(out.originalMediaType).toBe('image/jpeg');
    expect(out.renditions.map((r) => `${r.format}@${r.width}`).sort()).toEqual(
      ['avif@1000', 'avif@480', 'avif@800', 'webp@1000', 'webp@480', 'webp@800'].sort(),
    );
    for (const r of out.renditions) {
      expect(r.sha256).toBe(sha(r.bytes));
      const meta = await sharp(r.bytes).metadata();
      expect(meta.format).toBe(r.format === 'avif' ? 'heif' : 'webp');
      expect(meta.width).toBe(r.width);
    }
  }, 60_000);

  it('removes location and camera metadata', async () => {
    const input = await photo(1000, 700)
      .withExif({ IFD0: { Make: 'FixtureCam' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '43/1 39/1 0/1' } })
      .toBuffer();
    expect((await sharp(input).metadata()).exif).toBeDefined();
    const out = await processImage(input);
    for (const r of out.renditions) expect((await sharp(r.bytes).metadata()).exif).toBeUndefined();
  }, 60_000);

  it('turns a photograph taken with the camera on its side upright', async () => {
    const input = await photo(1000, 700).withMetadata({ orientation: 6 }).toBuffer();
    expect((await sharp(input).metadata()).orientation).toBe(6);
    const out = await processImage(input);
    expect([out.width, out.height]).toEqual([700, 1000]);
    expect(out.renditions.map((r) => `${r.format}@${r.width}x${r.height}`).sort()).toEqual(
      ['avif@480x686', 'avif@700x1000', 'webp@480x686', 'webp@700x1000'].sort(),
    );
    for (const r of out.renditions) expect((await sharp(r.bytes).metadata()).orientation ?? 1).toBe(1);
  }, 60_000);

  it('makes renditions from one master the size of the largest rendition', async () => {
    const out = await processImage(await photo(3000, 2000).toBuffer());
    expect([out.width, out.height]).toEqual([3000, 2000]);
    expect([...new Set(out.renditions.map((r) => r.width))]).toEqual([480, 800, 1200, 1600, 2400]);
    expect(out.renditions.find((r) => r.width === 2400)?.height).toBe(1600);
  }, 120_000);

  it('processes one image at a time, and a refusal does not hold up the next upload', async () => {
    const [a, refused, b] = await Promise.allSettled([
      processImage(await photo(700, 700).toBuffer()),
      processImage(Buffer.alloc(0)),
      processImage(await photo(900, 600).toBuffer()),
    ]);
    expect(a.status === 'fulfilled' && a.value.width).toBe(700);
    expect(refused.status === 'rejected' && (refused.reason as ImageError).code).toBe('empty');
    expect(b.status === 'fulfilled' && b.value.width).toBe(900);
  }, 60_000);

  it('refuses what it should not try to decode or publish', async () => {
    const refusal = async (input: Buffer) => {
      try {
        await processImage(input);
        return 'accepted';
      } catch (error) {
        expect(error).toBeInstanceOf(ImageError);
        return (error as ImageError).code;
      }
    };
    expect(await refusal(Buffer.alloc(0))).toBe('empty');
    expect(await refusal(Buffer.alloc(MAX_UPLOAD_BYTES + 1))).toBe('too_large');
    expect(await refusal(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toMatch(
      /format|unreadable/,
    );
    expect(await refusal(Buffer.from('definitely not an image'))).toBe('unreadable');
    expect(await refusal(await photo(400, 300).toBuffer())).toBe('too_small');
    expect(await refusal(await photo(3000, 600).toBuffer())).toBe('too_narrow');
  }, 60_000);

  it('names HEIC, unsupported and animated files from the header alone', () => {
    expect(formatProblem({ format: 'heif', compression: 'hevc' })).toBe('heic');
    expect(formatProblem({ format: 'heif', compression: 'av1' })).toBeNull();
    expect(formatProblem({ format: 'gif' })).toBe('format');
    expect(formatProblem({ format: 'svg' })).toBe('format');
    expect(formatProblem({ format: 'webp', pages: 12 })).toBe('animated');
    expect(formatProblem({ format: 'jpeg' })).toBeNull();
  });

  it('never makes a rendition wider than the image, 2400 px, or about 4.3 megapixels', () => {
    expect(renditionWidths(640, 480)).toEqual([480, 640]);
    expect(renditionWidths(1200, 800)).toEqual([480, 800, 1200]);
    expect(renditionWidths(2400, 1600)).toEqual([480, 800, 1200, 1600, 2400]);
    expect(renditionWidths(8000, 6000)).toEqual([480, 800, 1200, 1600, 2400]); // 4:3 keeps 2400
    expect(renditionWidths(3000, 3000)).toEqual([480, 800, 1200, 1600, 2078]); // square
    expect(renditionWidths(3024, 4032)).toEqual([480, 800, 1200, 1600, 1800]); // phone, portrait
    expect(renditionWidths(4000, 6000)).toEqual([480, 800, 1200, 1600, 1697]); // camera, portrait
  });
});
