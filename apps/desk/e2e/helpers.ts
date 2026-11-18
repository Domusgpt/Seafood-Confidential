import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, type TestInfo } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const MAILPIT = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324';

interface MailpitSummary {
  ID: string;
  Created: string;
}

/** Wait for a magic-link email to `email` newer than `since`, and return the link. */
async function waitForMagicLink(email: string, since: number): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt++) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}&limit=5`);
    const data = (await res.json()) as { messages: MailpitSummary[] };
    const fresh = data.messages.find((m) => new Date(m.Created).getTime() >= since - 1000);
    if (fresh) {
      const message = (await (await fetch(`${MAILPIT}/api/v1/message/${fresh.ID}`)).json()) as {
        HTML: string;
        Text: string;
      };
      const match = /href="([^"]*\/auth\/confirm\?[^"]+)"/.exec(message.HTML);
      if (match) return match[1].replaceAll('&amp;', '&');
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`no magic link arrived for ${email}`);
}

/** Sign in through the real flow: request a link, read it from Mailpit, open it. */
export async function signIn(page: Page, email: string) {
  await page.goto('/sign-in');
  const since = Date.now();
  await page.getByLabel('Work email').fill(email);
  await page.getByRole('button', { name: 'Email me a sign-in link' }).click();
  await expect(page.getByRole('status')).toContainText('If that address belongs to a desk account');
  const link = await waitForMagicLink(email, since);
  await page.goto(link);
}

/** WCAG 2.2 AA scan (axe); fails the test on any violation. */
export async function expectAccessible(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const summary = results.violations.map(
    (v) => `${v.id} (${v.impact}): ${v.nodes.length} node(s) — ${v.help}`,
  );
  expect(summary, `axe violations on ${label}`).toEqual([]);
}

/** Screenshots for the dev log (JPEG keeps the repository light). */
export async function shot(page: Page, testInfo: TestInfo, name: string, fullPage = true) {
  const dir = process.env.DESK_SHOTS_DIR;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  await page.screenshot({
    path: path.join(dir, `${testInfo.project.name}-${name}.jpg`),
    type: 'jpeg',
    quality: 78,
    fullPage,
  });
}

export function uniqueSuffix() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function randomGhostId() {
  return Array.from({ length: 24 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');
}

/** Open a <details> disclosure by its summary text (idempotent: never toggles it closed). */
export async function openDetails(page: Page, summary: string) {
  const details = page.locator('details', { has: page.locator('summary', { hasText: summary }) }).first();
  if ((await details.getAttribute('open')) === null) await details.locator('summary').first().click();
}

/** A documentation-range address (RFC 5737) so each test looks like a different intake client. */
export function testClientAddress() {
  return `198.51.100.${1 + Math.floor(Math.random() * 254)}`;
}
