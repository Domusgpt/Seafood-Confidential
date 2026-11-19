import { expect, test } from '@playwright/test';
import { testClientAddress, expectAccessible, shot, signIn, uniqueSuffix } from './helpers';

// Each test is its own intake client, so the per-client throttle (5 an hour) never couples runs.
test.beforeEach(async ({ page }) => {
  await page.setExtraHTTPHeaders({ 'x-forwarded-for': testClientAddress() });
});

test.describe('public pitch intake (SC-006)', () => {
  test('validates, accepts a pitch and returns only a receipt', async ({ page }, testInfo) => {
    await page.goto('/pitch');
    await expect(page.getByRole('heading', { level: 1, name: 'Pitch a story' })).toBeVisible();
    await expectAccessible(page, '/pitch');
    await shot(page, testInfo, 'pitch-form');

    // Empty submission: field-level errors, announced and linked to their inputs.
    await page.getByRole('button', { name: 'Send pitch' }).click();
    await expect(page.getByRole('main').getByRole('alert')).toContainText('Some answers need another look');
    await expect(page.getByLabel('Your name')).toHaveAttribute('aria-invalid', 'true');
    await expect(
      page.getByRole('main').getByText('We can only review a pitch if we may contact you about it.'),
    ).toBeVisible();
    await expectAccessible(page, '/pitch with errors');
    await shot(page, testInfo, 'pitch-errors');

    const suffix = uniqueSuffix();
    await page.getByLabel('Your name').fill('Jordan Grower');
    await page.getByLabel('Email', { exact: true }).fill(`jordan.${suffix}@example.test`);
    await page.getByLabel('Working title or subject').fill(`Oyster lease renewals ${suffix}`);
    await page
      .getByLabel('What would a reader want to know?')
      .fill('How does a lease renewal change what a small grower can plan?');
    await page.getByLabel('How do you know?').fill('I have run a two-acre oyster lease for eight years.');
    await page.getByLabel('Format you have in mind').selectOption('dispatch');
    await page.getByLabel('Seafood Confidential may contact me by email about this pitch.').check();
    await page.getByRole('button', { name: 'Send pitch' }).click();

    const receipt = page.getByTestId('pitch-receipt');
    await expect(receipt).toHaveText(/^P-[0-9A-F]{10}$/);
    await expect(page.getByRole('heading', { name: 'Thank you. Your pitch is in the queue.' })).toBeFocused();
    // The response never echoes what was submitted.
    await expect(page.getByRole('main').getByText(`jordan.${suffix}@example.test`)).toHaveCount(0);
    await shot(page, testInfo, 'pitch-receipt');
  });

  test('a filled honeypot gets a receipt but stores nothing', async ({ page }) => {
    await page.goto('/pitch');
    await page.locator('#pitch-website').fill('https://spam.example');
    await page.getByRole('button', { name: 'Send pitch' }).click();
    await expect(page.getByTestId('pitch-receipt')).toHaveText(/^P-[0-9A-F]{10}$/);
  });

  test('there is no way to upload files', async ({ page }) => {
    await page.goto('/pitch');
    await expect(page.locator('input[type=file]')).toHaveCount(0);
    await expect(page.locator('form[enctype="multipart/form-data"] input[type=file]')).toHaveCount(0);
  });

  test('AT-18: hostile markup in a pitch reaches staff as inert text', async ({ page }) => {
    const suffix = uniqueSuffix();
    let dialogs = 0;
    page.on('dialog', (dialog) => {
      dialogs++;
      void dialog.dismiss();
    });
    await page.goto('/pitch');
    await page.getByLabel('Your name').fill('<b>Bold</b> Person');
    await page.getByLabel('Email', { exact: true }).fill(`hostile.${suffix}@example.test`);
    await page
      .getByLabel('Working title or subject')
      .fill(`<img src=x onerror="window.__pwned=1"><script>window.__pwned=2</script> ${suffix}`);
    await page
      .getByLabel('What would a reader want to know?')
      .fill('<a href="javascript:window.__pwned=3">click</a> what changed?');
    await page
      .getByLabel('How do you know?')
      .fill('<iframe src="http://169.254.169.254/latest/meta-data/"></iframe> I was there.');
    await page.getByLabel('Seafood Confidential may contact me by email about this pitch.').check();
    await page.getByRole('button', { name: 'Send pitch' }).click();
    const receipt = (await page.getByTestId('pitch-receipt').textContent())!.trim();

    await signIn(page, 'owner@example.test');
    await page.goto(`/contributors/${receipt}`);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('<img src=x onerror=');
    await expect(page.getByRole('main').getByText('<iframe src=')).toBeVisible();
    await expect(page.locator('main iframe, main img[src="x"], main a[href^="javascript:"]')).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
    expect(dialogs).toBe(0);
  });
});
