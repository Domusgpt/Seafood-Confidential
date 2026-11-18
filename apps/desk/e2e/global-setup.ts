import { execFileSync } from 'node:child_process';

// Idempotent fixtures: two staff members and one identity without desk access (AT-03).
export default function globalSetup() {
  const run = (...args: string[]) =>
    execFileSync('node', ['--env-file=.env.ops.local', 'scripts/staff.ts', ...args], {
      stdio: 'pipe',
      encoding: 'utf8',
    });
  run('add', '--email', 'owner@example.test', '--name', 'Morgan Owner', '--role', 'owner');
  run('add', '--email', 'editor@example.test', '--name', 'Riley Editor', '--role', 'editor');
  run('identity', '--email', 'reader@example.test');
}
