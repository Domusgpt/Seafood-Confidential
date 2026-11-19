// Color math for the visual codex: WCAG 2.x contrast (normative) and APCA-W3 0.0.98G-4g Lc
// (informative; matches the dataviz skill's validator output). Values are verified in color.test.mjs.

export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`not a 6-digit hex color: ${hex}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const srgbToLinear = (c) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

export function relativeLuminance(hex) {
  const [r, g, b] = hexToRgb(hex).map(srgbToLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio (1–21). */
export function contrastRatio(a, b) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** WCAG 2.x levels for a text/background pair. */
export function wcagLevels(ratio) {
  return {
    aaNormal: ratio >= 4.5,
    aaLarge: ratio >= 3,
    aaaNormal: ratio >= 7,
    aaaLarge: ratio >= 4.5,
    nonText: ratio >= 3,
  };
}

/** APCA lightness contrast (Lc) of text on background; positive = dark on light. */
export function apcaLc(text, background) {
  const y = (hex) => {
    const [r, g, b] = hexToRgb(hex).map((c) => (c / 255) ** 2.4);
    return 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  };
  const clamp = (v) => (v > 0.022 ? v : v + (0.022 - v) ** 1.414);
  const yt = clamp(y(text));
  const yb = clamp(y(background));
  if (Math.abs(yb - yt) < 0.0005) return 0;
  if (yb > yt) {
    const sapc = (yb ** 0.56 - yt ** 0.57) * 1.14;
    return sapc < 0.1 ? 0 : (sapc - 0.027) * 100;
  }
  const sapc = (yb ** 0.65 - yt ** 0.62) * 1.14;
  return sapc > -0.1 ? 0 : (sapc + 0.027) * 100;
}
