// Shared helpers for the operator CLIs (scripts/staff.ts, scripts/agent.ts). These run as the
// database owner for local work and first-owner bootstrap; production staff use the desk itself.
import postgres from 'postgres';

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name}. Run \`pnpm --filter @sc/desk env:local\` against a running local stack.`);
    process.exit(2);
  }
  return value;
}

export function adminSql() {
  const url = requireEnv('SUPABASE_ADMIN_DB_URL');
  const host = new URL(url).hostname;
  if (!['127.0.0.1', 'localhost', '::1'].includes(host) && !process.argv.includes('--allow-remote')) {
    console.error(`Refusing to run against ${host}: pass --allow-remote to operate on a non-local database.`);
    process.exit(2);
  }
  return postgres(url, { max: 1, transform: postgres.camel, onnotice: () => {} });
}

export function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 ? process.argv[index + 1] : undefined;
}

export function args(name: string): string[] {
  const out: string[] = [];
  process.argv.forEach((v, i) => {
    if (v === `--${name}` && process.argv[i + 1]) out.push(...process.argv[i + 1].split(','));
  });
  return out.map((s) => s.trim()).filter(Boolean);
}
