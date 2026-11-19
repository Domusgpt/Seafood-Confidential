import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, type TestInfo } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const MAILPIT = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324';

interface MailpitSummary {
  ID: string;
  Created: string;
}

async function newestMessageId(email: string): Promise<string | null> {
  const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}&limit=1`);
  const data = (await res.json()) as { messages: MailpitSummary[] };
  return data.messages[0]?.ID ?? null;
}

/** Wait for a magic-link email to `email` that is newer than `previousId`, and return the link. */
async function waitForMagicLink(email: string, previousId: string | null): Promise<string | null> {
  for (let attempt = 0; attempt < 16; attempt++) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}&limit=1`);
    const data = (await res.json()) as { messages: MailpitSummary[] };
    const newest = data.messages[0];
    if (newest && newest.ID !== previousId) {
      const message = (await (await fetch(`${MAILPIT}/api/v1/message/${newest.ID}`)).json()) as {
        HTML: string;
        Text: string;
      };
      const match = /href="([^"]*\/auth\/confirm\?[^"]+)"/.exec(message.HTML);
      if (match) return match[1].replaceAll('&amp;', '&');
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return null;
}

/**
 * Sign in through the real flow: request a link, read it from Mailpit, open it. Only a link from an
 * email that arrived after the request is used; when the auth service throttles a quick second
 * request for the same address (it sends nothing), the request is repeated.
 */
export async function signIn(page: Page, email: string) {
  for (let attempt = 0; attempt < 4; attempt++) {
    await page.goto('/sign-in');
    const previousId = await newestMessageId(email);
    await page.getByLabel('Work email').fill(email);
    await page.getByRole('button', { name: 'Email me a sign-in link' }).click();
    await expect(page.getByRole('status')).toContainText('If that address belongs to a desk account');
    const link = await waitForMagicLink(email, previousId);
    if (link) {
      await page.goto(link);
      return;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`no magic link arrived for ${email}`);
}

/** WCAG 2.2 AA scan (axe); fails the test on any violation. */
export async function expectAccessible(page: Page, label: string) {
  // The public site animates text and images in (v0.7.0): judge the page at rest, as a reader sees it
  // once motion settles, not half-way through a fade.
  await page
    .waitForFunction(
      () => {
        const gsap = (
          window as unknown as {
            gsap?: {
              globalTimeline: {
                getChildren: (a: boolean, b: boolean, c: boolean) => { isActive: () => boolean }[];
              };
            };
          }
        ).gsap;
        return !gsap || gsap.globalTimeline.getChildren(true, true, false).every((t) => !t.isActive());
      },
      undefined,
      { timeout: 5000 },
    )
    .catch(() => {});
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const summary = results.violations.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.nodes.length} node(s) — ${v.help} [${v.nodes.map((n) => n.target.join(' ')).join(', ')}]`,
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

/** The local public site the desk publishes to during tests (scripts/serve-site.mjs). */
export const SITE = process.env.SITE_PUBLIC_URL ?? 'http://127.0.0.1:4173';

/** Open a <details> disclosure by its summary text (idempotent: never toggles it closed). */
export async function openDetails(page: Page, summary: string) {
  const details = page.locator('details', { has: page.locator('summary', { hasText: summary }) }).first();
  if ((await details.getAttribute('open')) === null) await details.locator('summary').first().click();
}

/** A documentation-range address (RFC 5737) so each test looks like a different intake client. */
export function testClientAddress() {
  return `198.51.100.${1 + Math.floor(Math.random() * 254)}`;
}
