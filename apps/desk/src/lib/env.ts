import 'server-only';
import { z } from 'zod';

// Server configuration, validated once. Nothing here is exposed to the browser: the desk has no
// NEXT_PUBLIC_ variables, and the Supabase secret key is not part of the app's environment at all
// (operator scripts read it from .env.ops.local).
const schema = z.object({
  DESK_SITE_URL: z.url(),
  SUPABASE_URL: z.url(),
  SUPABASE_PUBLISHABLE_KEY: z.string().startsWith('sb_publishable_'),
  DESK_DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, 'must be a postgres connection URL'),
  INTAKE_HASH_SECRET: z.string().min(32, 'use at least 32 random characters'),
  GHOST_ADMIN_URL: z.url().optional(),
  // Publishing (ADR-005): the desk builds the public site and deploys it. Without a Kit key the site
  // still publishes; only the newsletter is unavailable.
  SITE_PUBLIC_URL: z.url().default('http://127.0.0.1:4173'),
  SITE_DESTINATION: z.enum(['local', 'firebase']).default('local'),
  // A staging or pre-launch site: shown on every page, and search engines are asked not to index it.
  SITE_PREVIEW_NOTICE: z.string().trim().min(1).max(200).optional(),
  SITE_OUTPUT_DIR: z.string().min(1).default('.site-output'),
  SITE_ASSETS_DIR: z.string().min(1).default('site-static'),
  FIREBASE_SITE_ID: z
    .string()
    .regex(/^[a-z0-9-]{3,63}$/)
    .optional(),
  KIT_API_KEY: z.string().min(16, 'use the Kit v4 API key').optional(),
  KIT_FORM_ID: z
    .string()
    .regex(/^[0-9]{1,12}$/, 'the numeric ID of a Kit form')
    .optional(),
  KIT_SEGMENT_ID: z.coerce.number().int().positive().optional(),
  KIT_EMAIL_TEMPLATE_ID: z.coerce.number().int().positive().optional(),
  DESK_DB_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
  // Supabase's shared pooler in transaction mode (port 6543) does not support prepared statements.
  DESK_DB_PREPARE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  DESK_TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  DESK_AGENT_RATE_PER_MINUTE: z.coerce.number().int().min(1).max(10_000).default(120),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export type DeskEnv = z.infer<typeof schema>;

let cached: DeskEnv | undefined;

export function env(): DeskEnv {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Desk configuration is invalid (${problems}). See apps/desk/.env.example.`);
  }
  if (process.env.NODE_ENV === 'production' && process.env.DESK_TRUSTED_PROXY_HOPS === undefined) {
    throw new Error(
      'Set DESK_TRUSTED_PROXY_HOPS to the number of reverse proxies in front of the desk (see apps/desk/.env.example).',
    );
  }
  if (
    Object.keys(process.env).some((k) => k === 'SUPABASE_SECRET_KEY' || k === 'SUPABASE_SERVICE_ROLE_KEY')
  ) {
    throw new Error('The desk app must not run with a Supabase secret key in its environment (ADR-003).');
  }
  cached = parsed.data;
  return cached;
}

export const DESK_VERSION = '0.5.0';
