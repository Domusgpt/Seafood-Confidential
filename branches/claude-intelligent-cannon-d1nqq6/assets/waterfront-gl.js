// Bathymetry masthead renderer (WebGL2). Progressive enhancement only:
// - no WebGL2, compile failure or context loss → CSS fallback (class "gl-fallback")
// - prefers-reduced-motion → one static frame, no animation loop
// - paused when offscreen or the tab is hidden; device pixel ratio capped at 1.5; ~30 fps
// Shader sources are inlined at build time from assets/shaders/*.{vert,frag} (validated with glslang).
(() => {
  const canvas = document.querySelector('canvas[data-bathymetry]');
  if (!canvas) return;
  const host = canvas.closest('.masthead') || canvas.parentElement;
  const VERT = "#version 300 es\n// Full-screen triangle: three vertices cover the viewport without a quad's diagonal seam.\nin vec2 a_position;\n\nvoid main() {\n  gl_Position = vec4(a_position, 0.0, 1.0);\n}\n";
  const FRAG = "#version 300 es\n// Bathymetry: a slowly drifting depth-contour field in the Working Waterfront palette.\n// Contours are anti-aliased with screen-space derivatives; every fifth line is an \"index\n// contour\", as on a nautical chart. Decorative only: text never relies on it for contrast.\nprecision highp float;\n\nuniform vec2 u_resolution;        // drawing-buffer size in pixels\nuniform float u_time;             // seconds\nuniform vec2 u_pointer;           // drawing-buffer pixels, origin bottom-left\nuniform float u_pointerStrength;  // eased 0..1\nuniform vec3 u_background;        // ink\nuniform vec3 u_line;              // sea glass\nuniform vec3 u_indexLine;         // lighter sea glass\nuniform float u_density;          // contour lines per unit of height\n\nout vec4 fragColor;\n\n// Hash without sine (stable across GPUs and precisions).\nfloat hash(vec2 p) {\n  vec3 p3 = fract(vec3(p.xyx) * 0.1031);\n  p3 += dot(p3, p3.yzx + 33.33);\n  return fract((p3.x + p3.y) * p3.z);\n}\n\nfloat valueNoise(vec2 p) {\n  vec2 i = floor(p);\n  vec2 f = fract(p);\n  vec2 u = f * f * (3.0 - 2.0 * f);\n  float a = hash(i);\n  float b = hash(i + vec2(1.0, 0.0));\n  float c = hash(i + vec2(0.0, 1.0));\n  float d = hash(i + vec2(1.0, 1.0));\n  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);\n}\n\nfloat fbm(vec2 p) {\n  const mat2 rotation = mat2(0.8, -0.6, 0.6, 0.8);\n  float value = 0.0;\n  float amplitude = 0.5;\n  for (int octave = 0; octave < 5; octave++) {\n    value += amplitude * valueNoise(p);\n    p = rotation * p * 2.02 + vec2(17.0, 9.2);\n    amplitude *= 0.5;\n  }\n  return value;\n}\n\nvoid main() {\n  vec2 uv = gl_FragCoord.xy / u_resolution.y;\n  float t = u_time * 0.025;\n  vec2 p = uv * 2.6 + vec2(t * 1.3, -t * 0.7);\n\n  // Gentle domain warp, like current over a seabed.\n  vec2 warp = vec2(fbm(p + vec2(0.0, t)), fbm(p + vec2(5.2, -t)));\n  float height = fbm(p + 0.55 * warp);\n\n  // A soft \"sounding\" rise under the pointer.\n  vec2 d = (gl_FragCoord.xy - u_pointer) / u_resolution.y;\n  height += u_pointerStrength * 0.10 * exp(-dot(d, d) * 22.0);\n\n  float level = height * u_density;\n  float width = max(fwidth(level), 1e-4);\n  float distanceToLine = abs(fract(level - 0.5) - 0.5);\n  float line = 1.0 - smoothstep(0.0, width * 1.25, distanceToLine);\n  float isIndex = 1.0 - step(0.5, abs(mod(floor(level + 0.5), 5.0)));\n\n  vec3 color = u_background * mix(0.82, 1.12, smoothstep(0.25, 0.75, height));\n  vec3 lineColor = mix(u_line, u_indexLine, isIndex);\n  float alpha = mix(0.30, 0.62, isIndex);\n  fragColor = vec4(mix(color, lineColor, line * alpha), 1.0);\n}\n";
  const fallback = (reason) => {
    host.classList.add('gl-fallback');
    canvas.dataset.state = 'fallback';
    if (reason) canvas.dataset.reason = String(reason).slice(0, 120);
  };

  let gl = null;
  try {
    gl = canvas.getContext('webgl2', {
      antialias: false,
      alpha: false,
      depth: false,
      powerPreference: 'low-power',
    });
  } catch (err) {
    gl = null;
  }
  if (!gl) return fallback('webgl2-unavailable');

  const compile = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
      throw new Error(gl.getShaderInfoLog(shader) || 'compile failed');
    return shader;
  };
  let program;
  try {
    program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw new Error(gl.getProgramInfoLog(program) || 'link failed');
  } catch (err) {
    console.warn('[bathymetry]', err);
    return fallback('shader-error');
  }
  gl.useProgram(program);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'a_position');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  const uniform = (name) => gl.getUniformLocation(program, name);
  const U = {
    resolution: uniform('u_resolution'),
    time: uniform('u_time'),
    pointer: uniform('u_pointer'),
    strength: uniform('u_pointerStrength'),
    background: uniform('u_background'),
    line: uniform('u_line'),
    indexLine: uniform('u_indexLine'),
    density: uniform('u_density'),
  };
  const rootStyle = getComputedStyle(document.documentElement);
  const rgb = (name, fallbackHex) => {
    const hex = (rootStyle.getPropertyValue(name).trim() || fallbackHex).replace('#', '');
    const n = parseInt(hex, 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  };
  gl.uniform3fv(U.background, rgb('--masthead-background', '#102B3A'));
  gl.uniform3fv(U.line, rgb('--masthead-line', '#7FA59A'));
  gl.uniform3fv(U.indexLine, rgb('--masthead-index-line', '#8FB8AB'));
  gl.uniform1f(U.density, 11.0);

  let dpr = 1;
  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
    gl.uniform2f(U.resolution, w, h);
  };

  const pointer = { x: -1e4, y: -1e4, tx: -1e4, ty: -1e4, s: 0, ts: 0 };
  host.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    pointer.tx = (e.clientX - r.left) * dpr;
    pointer.ty = (r.bottom - e.clientY) * dpr;
    if (pointer.s === 0) {
      pointer.x = pointer.tx;
      pointer.y = pointer.ty;
    }
    pointer.ts = 1;
  });
  host.addEventListener('pointerleave', () => {
    pointer.ts = 0;
  });

  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let visible = true;
  let raf = 0;
  let last = 0;
  const start = performance.now();
  const STATIC_TIME = 24.0;

  const draw = (seconds) => {
    resize();
    pointer.x += (pointer.tx - pointer.x) * 0.08;
    pointer.y += (pointer.ty - pointer.y) * 0.08;
    pointer.s += (pointer.ts - pointer.s) * 0.05;
    gl.uniform1f(U.time, seconds);
    gl.uniform2f(U.pointer, pointer.x, pointer.y);
    gl.uniform1f(U.strength, motion.matches ? 0 : pointer.s);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
  const frame = (now) => {
    raf = 0;
    if (!visible || document.hidden || motion.matches) return;
    if (now - last >= 33) {
      last = now;
      draw(STATIC_TIME + (now - start) / 1000);
    }
    raf = requestAnimationFrame(frame);
  };
  const schedule = () => {
    if (motion.matches) {
      draw(STATIC_TIME);
      canvas.dataset.state = 'static';
      return;
    }
    canvas.dataset.state = 'running';
    if (!raf && visible && !document.hidden) raf = requestAnimationFrame(frame);
  };

  new IntersectionObserver((entries) => {
    visible = entries.some((e) => e.isIntersecting);
    schedule();
  }).observe(canvas);
  document.addEventListener('visibilitychange', schedule);
  motion.addEventListener?.('change', schedule);
  window.addEventListener('resize', () => motion.matches && draw(STATIC_TIME));
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    cancelAnimationFrame(raf);
    fallback('context-lost');
  });
  draw(STATIC_TIME);
  schedule();
})();
