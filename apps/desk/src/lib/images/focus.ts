// Where a photograph's subject sits, as the desk's form offers it (3 × 3); stored as 0–1 coordinates
// so the public site keeps the subject in frame however it crops (see site.css focal classes).
export const FOCUS: Record<string, [number, number]> = {
  'top-left': [0.2, 0.2],
  top: [0.5, 0.2],
  'top-right': [0.8, 0.2],
  left: [0.2, 0.5],
  center: [0.5, 0.5],
  right: [0.8, 0.5],
  'bottom-left': [0.2, 0.8],
  bottom: [0.5, 0.8],
  'bottom-right': [0.8, 0.8],
};

export const FOCUS_LABELS: Record<string, string> = {
  center: 'Centre',
  top: 'Top',
  bottom: 'Bottom',
  left: 'Left',
  right: 'Right',
  'top-left': 'Top left',
  'top-right': 'Top right',
  'bottom-left': 'Bottom left',
  'bottom-right': 'Bottom right',
};

/** The nearest form choice for stored coordinates. */
export function focusKey(x: number, y: number): string {
  let best = 'center';
  let distance = Infinity;
  for (const [key, [fx, fy]] of Object.entries(FOCUS)) {
    const d = (fx - x) ** 2 + (fy - y) ** 2;
    if (d < distance) {
      distance = d;
      best = key;
    }
  }
  return best;
}

/** What each upload outcome tells the editor (the upload route redirects with ?image=<code>). */
export const IMAGE_OUTCOMES: Record<string, { ok: boolean; text: string }> = {
  attached: { ok: true, text: 'Image attached. Readers see it when the story is published or updated.' },
  removed: { ok: true, text: 'Image removed. The live site changes when the story is updated.' },
  no_file: { ok: false, text: 'Choose an image file.' },
  empty: { ok: false, text: 'The file is empty.' },
  too_large: { ok: false, text: 'Images can be at most 15 MB.' },
  unreadable: {
    ok: false,
    text: 'That file is not an image the desk can read. Use a JPEG, PNG, WebP or AVIF.',
  },
  format: { ok: false, text: 'Use a JPEG, PNG, WebP or AVIF image.' },
  heic: {
    ok: false,
    text: 'That is an HEIC photo, the iPhone camera’s usual format, which the desk cannot read. Export it as JPEG first (on a Mac, open it in Preview and choose File, Export), or pick it from the iPhone itself, which converts it.',
  },
  animated: { ok: false, text: 'Animated images are not supported.' },
  damaged: { ok: false, text: 'The image could not be decoded; it may be damaged.' },
  too_small: { ok: false, text: 'Use an image at least 640 pixels wide.' },
  too_narrow: { ok: false, text: 'That image is too narrow or too tall to crop well.' },
  alt: { ok: false, text: 'Describe what the image shows in 5 to 300 characters.' },
  incomplete: { ok: false, text: 'Choose a rights record and describe the image.' },
  rights: {
    ok: false,
    text: 'Choose a rights record that belongs to this story, covers an image and has not been rejected.',
  },
  busy: { ok: false, text: 'This story is being published right now. Try again in a minute.' },
  role: { ok: false, text: 'Your role cannot change images.' },
  error: { ok: false, text: 'The image could not be saved. Try again; if it keeps failing, tell an owner.' },
};
