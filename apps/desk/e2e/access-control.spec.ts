import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import { expectAccessible, shot, signIn, uniqueSuffix } from './helpers';

const DESK_PATHS = ['/', '/stories', '/contributors', '/settings'];

test('signed-out visitors are sent to sign in', async ({ page }) => {
  for (const path of DESK_PATHS) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/sign-in$/);
  }
});

test('AT-03: a signed-in identity without a staff role sees no operational data', async ({
  page,
}, testInfo) => {
  await signIn(page, 'reader@example.test');
  await expect(page).toHaveURL(/\/no-access$/);
  await expect(
    page.getByRole('heading', { level: 1, name: 'This account cannot use the desk' }),
  ).toBeVisible();
  for (const path of DESK_PATHS) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/no-access$/);
  }
  await expectAccessible(page, '/no-access');
  await shot(page, testInfo, 'no-access');
});

test('SC-005: disabling a staff member cuts off access on the next request', async ({ page }) => {
  const email = `temp.${uniqueSuffix()}@example.test`;
  const staff = (...args: string[]) =>
    execFileSync('node', ['--env-file=.env.ops.local', 'scripts/staff.ts', ...args], { encoding: 'utf8' });
  staff('add', '--email', email, '--name', 'Temporary Editor', '--role', 'editor');
  await signIn(page, email);
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
  staff('disable', '--email', email);
  await page.goto('/stories');
  await expect(page).toHaveURL(/\/no-access$/);
});

test('an editor cannot see the audit trail or manage agents', async ({ page }) => {
  await signIn(page, 'editor@example.test');
  await page.goto('/settings');
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Audit trail' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Agent tokens' })).toHaveCount(0);
  await expect(page.getByRole('main').getByText('Create an agent')).toHaveCount(0);
  await expect(page.getByRole('columnheader', { name: 'Last signed in' })).toHaveCount(0);
});

test('SC-005: owners see whether each staff member has signed in yet (v0.7.3)', async ({ page }) => {
  // A newly added staff member shows "Not yet"; the owner, signed in now, shows a time.
  const name = `Newcomer ${uniqueSuffix()}`;
  execFileSync(
    'node',
    [
      '--env-file=.env.ops.local',
      'scripts/staff.ts',
      'add',
      '--email',
      `${name.replace(' ', '.').toLowerCase()}@example.test`,
      '--name',
      name,
      '--role',
      'editor',
    ],
    { encoding: 'utf8' },
  );
  await signIn(page, 'owner@example.test');
  await page.goto('/settings');
  const staff = page.getByRole('table', { name: 'Staff principals and roles' });
  await expect(staff.getByRole('columnheader', { name: 'Last signed in' })).toBeVisible();
  await expect(staff.getByRole('row', { name: new RegExp(`${name}.*Not yet`) })).toBeVisible();
  await expect(
    staff
      .getByRole('row', { name: /Morgan Owner/ })
      .getByRole('cell')
      .last(),
  ).not.toHaveText('Not yet');
  await expectAccessible(page, '/settings (owner)');
});

test('sign-in does not reveal whether an address has an account', async ({ page }) => {
  await page.goto('/sign-in');
  await page.getByLabel('Work email').fill(`nobody.${uniqueSuffix()}@example.test`);
  await page.getByRole('button', { name: 'Email me a sign-in link' }).click();
  await expect(page.getByRole('status')).toContainText(
    'If that address belongs to a desk account, a sign-in link is on its way.',
  );
  // With Supabase's built-in mailer (the default), the page says up front what makes a link work.
  await expect(page.getByRole('status')).toContainText('Open it in this browser');
  const help = page.getByRole('region', { name: 'Getting the link to work' });
  await expect(help).toContainText('Open the email on this device, and the link in this browser.');
  await expect(help).toContainText('check your spam or junk folder');
  await expectAccessible(page, '/sign-in');
});

test('sign-in links cannot redirect off-site and bad links fail closed', async ({ page }) => {
  await page.goto('/auth/confirm?token_hash=not-a-real-token-hash&type=email&next=https://evil.example/');
  await expect(page).toHaveURL(/\/sign-in\?error=link$/);
  await expect(page.getByRole('main').getByRole('alert')).toContainText('invalid or has expired');
});

test('HTML responses carry a nonce CSP and hardening headers', async ({ request }) => {
  const res = await request.get('/sign-in');
  const h = res.headers();
  expect(h['content-security-policy']).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
  expect(h['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(h['content-security-policy']).toContain("object-src 'none'");
  expect(h['x-frame-options']).toBe('DENY');
  expect(h['x-content-type-options']).toBe('nosniff');
  expect(h['referrer-policy']).toBe('same-origin');
  expect(h['x-request-id']).toMatch(/^req_[0-9a-f]{32}$/);
  expect(h['x-powered-by']).toBeUndefined();
});

test('the scheduled publishing sweep does not exist unless a scheduler identity is configured', async ({
  request,
}) => {
  for (const auth of [undefined, 'Bearer aaa.bbb.ccc']) {
    const res = await request.post('/api/publishing/sweep', {
      headers: auth ? { Authorization: auth } : {},
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(404);
    expect(res.headers()['cache-control']).toContain('no-store');
  }
});
