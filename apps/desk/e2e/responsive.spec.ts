import { expect, test } from '@playwright/test';
import { expectAccessible, shot, signIn } from './helpers';

// Phone layout: no horizontal page scroll, navigation reachable, forms usable.
test('phone layouts', async ({ page }, testInfo) => {
  await page.goto('/pitch');
  await expect(page.getByRole('heading', { level: 1, name: 'Pitch a story' })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await expectAccessible(page, 'mobile /pitch');
  await shot(page, testInfo, 'pitch');

  await signIn(page, 'owner@example.test');
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
  for (const path of ['/', '/stories', '/contributors', '/settings']) {
    await page.goto(path);
    const scroll = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(scroll, `horizontal overflow on ${path}`).toBeLessThanOrEqual(0);
  }
  await page.goto('/');
  await shot(page, testInfo, 'today');
  await page.goto('/stories');
  await shot(page, testInfo, 'stories');
});
