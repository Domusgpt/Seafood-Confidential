import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

// Security headers that do not depend on the request. The nonce-based Content-Security-Policy is
// set per request in src/proxy.ts; JSON API routes set their own strict policy.
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()',
  },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  // The desk is an internal tool: nothing in it, the public pitch form included, belongs in search.
  { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
];

const nextConfig: NextConfig = {
  // Cache Components stay off (ADR-003): every desk page is per-user and permission-sensitive,
  // revocation must apply on the next request, and the CSP nonce needs per-request rendering.
  poweredByHeader: false,
  reactStrictMode: true,
  // Self-contained server for the container image (apps/desk/Dockerfile); traced from the
  // workspace root so packages/contracts and the kit's contract schema are included.
  output: 'standalone',
  outputFileTracingRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'),
  typedRoutes: true,
  serverExternalPackages: ['pino', 'postgres'],
  experimental: {
    serverActions: { bodySizeLimit: '1mb' },
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
