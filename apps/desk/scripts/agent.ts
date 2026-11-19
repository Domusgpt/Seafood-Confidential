#!/usr/bin/env node
// Operator CLI for agent principals (local development; the owner uses Settings in the desk).
//   pnpm --filter @sc/desk agent create --name "Research agent" --scopes briefs.list,items.read,drafts.propose,jobs.read [--grant SC-2026-001] [--expires-days 30]
//   pnpm --filter @sc/desk agent grant --prefix abcd1234 --item SC-2026-001
//   pnpm --filter @sc/desk agent revoke --prefix abcd1234
//   pnpm --filter @sc/desk agent list
// The token is printed once; only its prefix and SHA-256 hash are stored.
import { generateAgentToken } from '../src/lib/agent-tokens.ts';
import { adminSql, arg, args } from './ops-common.ts';

const SCOPES = [
  'briefs.list',
  'items.read',
  'drafts.propose',
  'drafts.revise',
  'social.propose',
  'jobs.read',
];
const command = process.argv[2];
const sql = adminSql();

try {
  if (command === 'create') {
    const name = arg('name');
    const scopes = args('scopes');
    const grants = args('grant');
    const days = Number(arg('expires-days') ?? '0');
    if (!name || scopes.length === 0 || scopes.some((s) => !SCOPES.includes(s))) {
      console.error(
        `usage: agent create --name <name> --scopes <${SCOPES.join(',')}> [--grant SC-YYYY-NNN] [--expires-days N]`,
      );
      process.exit(2);
    }
    const issued = generateAgentToken();
    const expiresAt = days > 0 ? new Date(Date.now() + days * 86_400_000) : null;
    await sql.begin(async (tx) => {
      const [p] = await tx<
        { id: string }[]
      >`insert into app.principals (kind, display_name) values ('agent', ${name}) returning id`;
      await tx`
        insert into private.agent_credentials (principal_id, token_prefix, token_hash, scopes, expires_at)
        values (${p.id}, ${issued.prefix}, ${issued.hash}, ${scopes}, ${expiresAt})
      `;
      for (const contentId of grants) {
        const rows = await tx`
          insert into app.agent_item_grants (principal_id, item_id)
          select ${p.id}, id from app.editorial_items where content_id = ${contentId}
          returning item_id
        `;
        if (rows.length === 0) throw new Error(`no editorial item ${contentId}`);
      }
    });
    console.log(
      `agent "${name}" created; scopes: ${scopes.join(', ')}${grants.length ? `; granted: ${grants.join(', ')}` : ''}`,
    );
    console.log('token (shown once, store it in a secret manager):');
    console.log(issued.token);
  } else if (command === 'grant') {
    const prefix = arg('prefix');
    const item = arg('item');
    const rows = await sql`
      insert into app.agent_item_grants (principal_id, item_id)
      select c.principal_id, i.id from private.agent_credentials c, app.editorial_items i
      where c.token_prefix = ${prefix ?? ''} and i.content_id = ${item ?? ''}
      on conflict do nothing returning item_id
    `;
    console.log(
      rows.length
        ? `granted ${item} to agent ${prefix}`
        : 'nothing granted (unknown prefix or item, or already granted)',
    );
  } else if (command === 'revoke') {
    const prefix = arg('prefix');
    const rows = await sql`
      update private.agent_credentials set revoked_at = now()
      where token_prefix = ${prefix ?? ''} and revoked_at is null returning id
    `;
    console.log(rows.length ? `revoked token ${prefix}` : 'no active token with that prefix');
  } else if (command === 'list') {
    const rows = await sql<
      {
        tokenPrefix: string;
        name: string;
        status: string;
        scopes: string[];
        lastUsedAt: Date | null;
        revokedAt: Date | null;
      }[]
    >`
      select c.token_prefix, p.display_name as name, p.status, c.scopes, c.last_used_at, c.revoked_at
      from private.agent_credentials c join app.principals p on p.id = c.principal_id order by c.created_at
    `;
    console.table(
      rows.map((r) => ({
        prefix: r.tokenPrefix,
        agent: r.name,
        status: r.revokedAt ? 'revoked' : r.status,
        scopes: r.scopes.join(','),
        lastUsed: r.lastUsedAt?.toISOString() ?? '—',
      })),
    );
  } else {
    console.error('usage: agent <create|grant|revoke|list> [options]');
    process.exit(2);
  }
} finally {
  await sql.end();
}
