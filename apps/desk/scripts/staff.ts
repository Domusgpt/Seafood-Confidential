#!/usr/bin/env node
// Operator CLI for desk staff (local development and first-owner bootstrap).
//   pnpm --filter @sc/desk staff add --email editor@example.test --name "Editor Name" --role editor
//   pnpm --filter @sc/desk staff disable --email editor@example.test
//   pnpm --filter @sc/desk staff identity --email reader@example.test   (sign-in without desk access)
//   pnpm --filter @sc/desk staff list
// Creates the Supabase Auth user with the admin API (secret key from .env.ops.local, never the
// app's environment), then the desk principal and staff assignment in one transaction.
import { createClient } from '@supabase/supabase-js';
import { adminSql, arg, requireEnv } from './ops-common.ts';

const ROLES = ['owner', 'managing_editor', 'editor'];
const command = process.argv[2];
const sql = adminSql();

async function ensureAuthUser(email: string): Promise<string> {
  const [existing] = await sql<{ id: string }[]>`select id from auth.users where lower(email) = ${email}`;
  if (existing) return existing.id;
  const admin = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SECRET_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (error || !data.user)
    throw new Error(`could not create the auth user: ${error?.message ?? 'unknown error'}`);
  return data.user.id;
}

try {
  if (command === 'add') {
    const email = arg('email')?.toLowerCase();
    const name = arg('name') ?? email?.split('@')[0];
    const role = arg('role') ?? 'editor';
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !ROLES.includes(role)) {
      console.error(`usage: staff add --email <address> --name <display name> --role <${ROLES.join('|')}>`);
      process.exit(2);
    }
    const uid = await ensureAuthUser(email);
    const principalId = await sql.begin(async (tx) => {
      const [p] = await tx<{ id: string }[]>`
        insert into app.principals (kind, display_name, auth_user_id)
        values ('human', ${name!}, ${uid})
        on conflict (auth_user_id) do update set display_name = excluded.display_name, status = 'active'
        returning id
      `;
      await tx`
        insert into app.staff_assignments (principal_id, role)
        select ${p.id}, ${role}
        where not exists (
          select 1 from app.staff_assignments where principal_id = ${p.id} and role = ${role} and revoked_at is null
        )
      `;
      return p.id;
    });
    console.log(`staff ${email} is active as ${role} (principal ${principalId})`);
  } else if (command === 'identity') {
    // A sign-in identity with no desk principal (a reader or contributor); used to prove AT-03.
    const email = arg('email')?.toLowerCase();
    if (!email) {
      console.error('usage: staff identity --email <address>');
      process.exit(2);
    }
    const uid = await ensureAuthUser(email);
    console.log(`identity ${email} exists without desk access (auth user ${uid})`);
  } else if (command === 'disable') {
    const email = arg('email')?.toLowerCase();
    if (!email) {
      console.error('usage: staff disable --email <address>');
      process.exit(2);
    }
    const rows = await sql`
      update app.principals set status = 'disabled'
      where auth_user_id = (select id from auth.users where lower(email) = ${email}) returning id
    `;
    console.log(rows.length ? `disabled ${email}` : `no desk principal for ${email}`);
  } else if (command === 'list') {
    const rows = await sql<{ email: string; displayName: string; status: string; roles: string[] }[]>`
      select u.email, p.display_name, p.status,
             array(select a.role from app.staff_assignments a where a.principal_id = p.id and a.revoked_at is null) as roles
      from app.principals p join auth.users u on u.id = p.auth_user_id
      where p.kind = 'human' order by u.email
    `;
    console.table(
      rows.map((r) => ({ email: r.email, name: r.displayName, status: r.status, roles: r.roles.join(', ') })),
    );
  } else {
    console.error('usage: staff <add|identity|disable|list> [options]');
    process.exit(2);
  }
} finally {
  await sql.end();
}
