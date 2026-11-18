import type { MetadataRoute } from 'next';

// The desk is private. Only the public pitch form may be indexed.
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: '*', allow: '/pitch', disallow: '/' }] };
}
