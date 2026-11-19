import { createHash } from 'node:crypto';
import sharp, { type Metadata, type OutputInfo } from 'sharp';

// Story images (v0.7.0): one upload becomes the renditions the public site serves. Decoding is
// bounded (bytes, pixels, formats), EXIF orientation is applied, and every rendition is re-encoded
// from pixels, so no metadata (camera details, GPS location) ever reaches a reader. The original is
// kept, unchanged, for the record (editorial/EDITORIAL_PLAYBOOK.md, "Images and media").
//
// Memory is bounded too, because the desk runs on Cloud Run in 512 MiB:
// - the upload is decoded once, straight to an upright master the size of the largest rendition
//   (JPEG and WebP shrink while they decode), and every rendition is made from that master;
// - the largest rendition is at most 2400 px wide and about 4.3 megapixels, because the AVIF
//   encoder's memory grows with the frame (portrait photographs are the heavy case);
// - one image at a time per server process, and libvips' cache is off;
// - the container limits glibc's malloc arenas (MALLOC_ARENA_MAX=2 in the Dockerfile).
// Measured on one CPU (sharp alone): a 59-megapixel photograph went from 939 MiB to about 250 MiB.

/** Widths the site's srcset offers; an image never gets a rendition wider than itself. */
export const IMAGE_WIDTHS = [480, 800, 1200, 1600, 2400] as const;
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const MAX_INPUT_PIXELS = 60_000_000;
const MIN_WIDTH = 640;
const LARGEST = IMAGE_WIDTHS[IMAGE_WIDTHS.length - 1];
/** The largest rendition's area: 2400 × 1800, so landscape photographs keep the full 2400 px. */
const MAX_RENDITION_PIXELS = 2400 * 1800;

// libvips keeps recent operations cached for reuse; occasional uploads never benefit from it.
sharp.cache(false);

const MEDIA_TYPES = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heif: 'image/avif', // libvips reports AVIF as heif (HEIC is refused below)
} as const;

export type ImageErrorCode =
  | 'empty'
  | 'too_large'
  | 'unreadable'
  | 'format'
  | 'heic'
  | 'animated'
  | 'damaged'
  | 'too_small'
  | 'too_narrow';

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

/** What the header alone rules out, before any pixels are decoded. */
export function formatProblem(
  meta: Pick<Metadata, 'format' | 'compression' | 'pages'>,
): Extract<ImageErrorCode, 'format' | 'heic' | 'animated'> | null {
  // HEIC (an iPhone camera's usual format) shares AVIF's container but uses a codec the desk's
  // image library does not include, so say what it is rather than calling it damaged.
  if (meta.format === 'heif' && meta.compression === 'hevc') return 'heic';
  if (!meta.format || !(meta.format in MEDIA_TYPES)) return 'format';
  if ((meta.pages ?? 1) > 1) return 'animated';
  return null;
}

const REFUSALS: Record<ReturnType<typeof formatProblem> & string, string> = {
  heic: 'HEIC photos are not supported; export it as JPEG first.',
  format: 'Use a JPEG, PNG, WebP or AVIF image.',
  animated: 'Animated images are not supported.',
};

/** The largest rendition's width for an upright image: never wider than the image, LARGEST, or the area cap. */
export function largestWidth(width: number, height: number): number {
  return Math.min(width, LARGEST, Math.floor(Math.sqrt((MAX_RENDITION_PIXELS * width) / height)));
}

/** Widths to make: the site's widths below the largest, then the largest itself. */
export function renditionWidths(width: number, height: number): number[] {
  const top = largestWidth(width, height);
  return [...IMAGE_WIDTHS.filter((w) => w < top), top];
}

// One image at a time per server process, so two uploads at once cannot double the peak.
let queue: Promise<unknown> = Promise.resolve();

export function processImage(input: Buffer): Promise<ProcessedImage> {
  const turn = queue.then(() => processOne(input));
  queue = turn.catch(() => undefined);
  return turn;
}

async function processOne(input: Buffer): Promise<ProcessedImage> {
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
  const problem = formatProblem(meta);
  if (problem) throw new ImageError(problem, REFUSALS[problem]);
  const mediaType = MEDIA_TYPES[meta.format as keyof typeof MEDIA_TYPES];

  // The upright size, from the header (EXIF orientations 5 to 8 turn the picture a quarter).
  const { width, height } = meta.autoOrient;
  if (!width || !height) throw new ImageError('unreadable', 'The image has no dimensions.');
  if (width < MIN_WIDTH) throw new ImageError('too_small', `Use an image at least ${MIN_WIDTH} pixels wide.`);
  if (width / height > 4 || height / width > 4)
    throw new ImageError('too_narrow', 'That image is too narrow to crop well.');

  // Decode once, upright, in sRGB, at the largest rendition's size. failOn 'error' rather than
  // sharp's default 'warning': uploads come from signed-in staff, and many real camera JPEGs carry
  // harmless decoder warnings; the pixel limit above still bounds what a file can make us allocate.
  const widths = renditionWidths(width, height);
  let master: { data: Buffer; info: OutputInfo };
  try {
    master = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error', autoOrient: true })
      .resize({ width: widths[widths.length - 1], withoutEnlargement: true, fastShrinkOnLoad: false })
      .toColourspace('srgb')
      .raw({ depth: 'uchar' })
      .toBuffer({ resolveWithObject: true });
  } catch {
    throw new ImageError('damaged', 'The image could not be decoded; it may be damaged.');
  }
  const raw = {
    width: master.info.width,
    height: master.info.height,
    channels: master.info.channels as 1 | 2 | 3 | 4,
  };

  const renditions: Rendition[] = [];
  for (const w of widths) {
    const resized = sharp(master.data, { raw }).resize({ width: w, withoutEnlargement: true });
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
