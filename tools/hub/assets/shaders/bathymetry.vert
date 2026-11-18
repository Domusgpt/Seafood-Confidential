#version 300 es
// Full-screen triangle: three vertices cover the viewport without a quad's diagonal seam.
in vec2 a_position;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
