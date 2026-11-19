#version 300 es
// Bathymetry: a slowly drifting depth-contour field in the Working Waterfront palette.
// Contours are anti-aliased with screen-space derivatives; every fifth line is an "index
// contour", as on a nautical chart. Decorative only: text never relies on it for contrast.
precision highp float;

uniform vec2 u_resolution;        // drawing-buffer size in pixels
uniform float u_time;             // seconds
uniform vec2 u_pointer;           // drawing-buffer pixels, origin bottom-left
uniform float u_pointerStrength;  // eased 0..1
uniform vec3 u_background;        // ink
uniform vec3 u_line;              // sea glass
uniform vec3 u_indexLine;         // lighter sea glass
uniform float u_density;          // contour lines per unit of height

out vec4 fragColor;

// Hash without sine (stable across GPUs and precisions).
float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  const mat2 rotation = mat2(0.8, -0.6, 0.6, 0.8);
  float value = 0.0;
  float amplitude = 0.5;
  for (int octave = 0; octave < 5; octave++) {
    value += amplitude * valueNoise(p);
    p = rotation * p * 2.02 + vec2(17.0, 9.2);
    amplitude *= 0.5;
  }
  return value;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.y;
  float t = u_time * 0.025;
  vec2 p = uv * 2.6 + vec2(t * 1.3, -t * 0.7);

  // Gentle domain warp, like current over a seabed.
  vec2 warp = vec2(fbm(p + vec2(0.0, t)), fbm(p + vec2(5.2, -t)));
  float height = fbm(p + 0.55 * warp);

  // A soft "sounding" rise under the pointer.
  vec2 d = (gl_FragCoord.xy - u_pointer) / u_resolution.y;
  height += u_pointerStrength * 0.10 * exp(-dot(d, d) * 22.0);

  float level = height * u_density;
  float width = max(fwidth(level), 1e-4);
  float distanceToLine = abs(fract(level - 0.5) - 0.5);
  float line = 1.0 - smoothstep(0.0, width * 1.25, distanceToLine);
  float isIndex = 1.0 - step(0.5, abs(mod(floor(level + 0.5), 5.0)));

  vec3 color = u_background * mix(0.82, 1.12, smoothstep(0.25, 0.75, height));
  vec3 lineColor = mix(u_line, u_indexLine, isIndex);
  float alpha = mix(0.30, 0.62, isIndex);
  fragColor = vec4(mix(color, lineColor, line * alpha), 1.0);
}
