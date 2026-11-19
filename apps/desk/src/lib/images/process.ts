import { createHash } from 'node:crypto';
import sharp, { type Metadata, type OutputInfo } from 'sharp';

// Story images (v0.7.0): one upload becomes the renditions the public site serves. Decoding is
// bounded (bytes, pixels, formats), EXIF orientation is applied, and every rendition is re-encoded
// from pixels, so no metadata (camera details, GPS location) ever reaches a reader. The original is
// kept, unchanged, for the record (editorial/EDITORIAL_PLAYBOOK.md, "Images and media").

/** Widths the site's srcset offers; an image never gets a rendition wider than itself. */
export const IMAGE_WIDTHS = [480, 800, 1200, 1600, 2400] as const;
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const MAX_INPUT_PIXELS = 60_000_000;
const MIN_WIDTH = 640;

const MEDIA_TYPES = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heif: 'image/avif', // libvips reports AVIF as heif
} as const;

export type ImageErrorCode =
  'empty' | 'too_large' | 'unreadable' | 'format' | 'animated' | 'damaged' | 'too_small' | 'too_narrow';

/** A reason an upload was refused. The code is stable (the desk maps it to its own message). */
export class ImageError extends Error {
  // A plain field, not a constructor parameter property: the operator CLI runs this file with
  // Node's built-in type stripping, which only removes erasable syntax.
  code: ImageErrorCode;
  constructor(code: ImageErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export interface Rendition {
  format: 'avif' | 'webp';
  width: number;
  height: number;
  sha256: string;
  bytes: Buffer;
}

export interface ProcessedImage {
  width: number;
  height: number;
  originalSha256: string;
  originalMediaType: (typeof MEDIA_TYPES)[keyof typeof MEDIA_TYPES];
  renditions: Rendition[];
}

const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');

export async function processImage(input: Buffer): Promise<ProcessedImage> {
  if (input.length === 0) throw new ImageError('empty', 'The file is empty.');
  if (input.length > MAX_UPLOAD_BYTES) throw new ImageError('too_large', 'Images can be at most 15 MB.');
  let meta: Metadata;
  try {
    meta = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  } catch {
    throw new ImageError(
      'unreadable',
      'That file is not an image the desk can read (JPEG, PNG, WebP or AVIF).',
    );
  }
  const mediaType = meta.format ? MEDIA_TYPES[meta.format as keyof typeof MEDIA_TYPES] : undefined;
  if (!mediaType) throw new ImageError('format', 'Use a JPEG, PNG, WebP or AVIF image.');
  if ((meta.pages ?? 1) > 1) throw new ImageError('animated', 'Animated images are not supported.');

  // Decode once, upright, in sRGB; every rendition starts from these pixels.
  let upright: { data: Buffer; info: OutputInfo };
  try {
    upright = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' })
      .rotate()
      .toColourspace('srgb')
      .png({ compressionLevel: 1 })
      .toBuffer({ resolveWithObject: true });
  } catch {
    throw new ImageError('damaged', 'The image could not be decoded; it may be damaged.');
  }
  const { width, height } = upright.info;
  if (width < MIN_WIDTH) throw new ImageError('too_small', `Use an image at least ${MIN_WIDTH} pixels wide.`);
  if (width / height > 4 || height / width > 4)
    throw new ImageError('too_narrow', 'That image is too narrow to crop well.');

  const widths: number[] = IMAGE_WIDTHS.filter((w) => w < width);
  if (width <= IMAGE_WIDTHS[IMAGE_WIDTHS.length - 1]) widths.push(width);
  else widths.push(IMAGE_WIDTHS[IMAGE_WIDTHS.length - 1]);

  const renditions: Rendition[] = [];
  for (const w of [...new Set(widths)]) {
    const resized = sharp(upright.data).resize({ width: w, withoutEnlargement: true });
    for (const format of ['avif', 'webp'] as const) {
      const out =
        format === 'avif'
          ? await resized
              .clone()
              .avif({ quality: 52, effort: 4, chromaSubsampling: '4:2:0' })
              .toBuffer({ resolveWithObject: true })
          : await resized
              .clone()
              .webp({ quality: 78, effort: 5, smartSubsample: true })
              .toBuffer({ resolveWithObject: true });
      renditions.push({
        format,
        width: out.info.width,
        height: out.info.height,
        sha256: sha256(out.data),
        bytes: out.data,
      });
    }
  }
  return { width, height, originalSha256: sha256(input), originalMediaType: mediaType, renditions };
}
