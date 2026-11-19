import { expect, test } from '@playwright/test';
import { testClientAddress, expectAccessible, openDetails, shot, signIn, uniqueSuffix } from './helpers';

// Each test is its own intake client, so the per-client throttle (5 an hour) never couples runs.
test.beforeEach(async ({ page }) => {
  await page.setExtraHTTPHeaders({ 'x-forwarded-for': testClientAddress() });
});

// SC-006 → SC-007 vertical slice: a public pitch becomes a commissioned story with an owner, a next
// action, its text written in the desk, source records and rights records, gated before release.
test('pitch to release-ready story', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const suffix = uniqueSuffix();
  const subject = `Day-boat quota changes ${suffix}`;
  const email = `avery.${suffix}@example.test`;

  await page.goto('/pitch');
  await page.getByLabel('Your name').fill('Avery Fisher');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Where you work or fish').fill('F/V Fixture, Portland');
  await page.getByLabel('Working title or subject').fill(subject);
  await page
    .getByLabel('What would a reader want to know?')
    .fill('What does the new quota rule change for a day-boat crew?');
  await page
    .getByLabel('How do you know?')
    .fill('I have fished out of Portland for twelve seasons and keep landing records.');
  await page.getByLabel('Seafood Confidential may contact me by email about this pitch.').check();
  await page.getByRole('button', { name: 'Send pitch' }).click();
  const receipt = (await page.getByTestId('pitch-receipt').textContent())!.trim();

  await signIn(page, 'owner@example.test');
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
  await expectAccessible(page, 'Today');
  await shot(page, testInfo, 'today');

  await page
    .getByRole('navigation', { name: 'Desk' })
    .getByRole('link', { name: /Contributors/ })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Contributors' })).toBeVisible();
  await shot(page, testInfo, 'contributors');
  await page.getByRole('link', { name: subject }).click();
  await expect(page.getByRole('heading', { level: 1, name: subject })).toBeVisible();
  await expect(page.getByRole('main').getByText(email)).toBeVisible();
  await expect(page.getByRole('main').getByText(`Pitch ${receipt}`)).toBeVisible();
  await expectAccessible(page, 'pitch detail');
  await shot(page, testInfo, 'pitch-detail');

  const decide = page.getByRole('form', { name: 'Decide on this pitch' });
  await decide.getByLabel('Decision').selectOption('accepted');
  await decide.getByText('Story settings if accepted').click();
  await decide.getByLabel('Section').selectOption('on_the_water');
  await decide.getByRole('button', { name: 'Save decision' }).click();
  await expect(page).toHaveURL(/\/stories\/SC-\d{4}-\d{3,}\?from=pitch$/);
  const contentId = /SC-\d{4}-\d{3,}/.exec(page.url())![0];
  await expect(page.getByRole('main').getByText('Next: Write the story')).toBeVisible();
  await expect(page.getByRole('main').getByText('Owner: Morgan Owner')).toBeVisible();

  // The story is written in the desk (ADR-005).
  const text = page.getByRole('form', { name: 'Story text' });
  await text
    .getByLabel('Story', { exact: true })
    .fill(
      'Day-boat crews out of Portland face a new quota rule this season.\n\n## What changes\n\nThe rule sets a weekly limit per boat instead of a seasonal one.',
    );
  await text.getByRole('button', { name: 'Save the text' }).click();
  await expect(text.getByRole('status')).toContainText('Saved as revision 1.');
  await expect(
    page.getByRole('main').getByText('Next: Keep writing, then mark the story Drafting'),
  ).toBeVisible();

  const details = page.getByRole('form', { name: 'Edit story details' });
  await details.getByLabel('Operations status').selectOption('drafting');
  await details.getByLabel('Due date').fill('2026-11-20');
  await details.getByRole('button', { name: 'Save details' }).click();
  await expect(details.getByRole('status')).toContainText('Story details saved.');
  await expect(page.getByRole('main').getByText('Next: Record the sources')).toBeVisible();

  await openDetails(page, 'Add a source');
  const sourceForm = page.getByRole('form', { name: 'Add a source' });
  await sourceForm.getByLabel('Source ID').fill('src-landings-2026-01');
  await sourceForm.getByLabel('Type').selectOption('official_document');
  await sourceForm.getByLabel('Title', { exact: true }).fill('Fixture landings summary');
  await sourceForm.getByLabel('Claim it supports').fill('Landings fell year over year.');
  await sourceForm.getByLabel('May agents process it?').selectOption('yes');
  await sourceForm.getByLabel(/Cite it publicly/).check();
  await sourceForm.getByRole('button', { name: 'Record source' }).click();
  await expect(sourceForm.getByRole('status')).toContainText('Source SRC-LANDINGS-2026-01 recorded.');
  await expect(
    page.getByRole('main').getByText('Next: Finish the draft and send it to review'),
  ).toBeVisible();

  await openDetails(page, 'Add a rights record');
  const rightsForm = page.getByRole('form', { name: 'Add a rights record' });
  await rightsForm.getByLabel('Asset', { exact: true }).fill('Dock at dawn, Portland');
  await rightsForm.getByLabel('Kind', { exact: true }).selectOption('photo');
  await rightsForm.getByLabel('Provenance').selectOption('documentary');
  await rightsForm.getByLabel('Credit line').fill('Photo: Avery Fisher');
  await rightsForm.getByLabel('Web').check();
  await rightsForm.getByLabel('Newsletter').check();
  await rightsForm.getByRole('button', { name: 'Save rights record' }).click();
  await expect(rightsForm.getByRole('status')).toContainText('saved');

  await details.getByLabel('Operations status').selectOption('in_review');
  await details.getByRole('button', { name: 'Save details' }).click();
  await expect(page.getByRole('main').getByText('Next: Clear rights and credits for 1 asset')).toBeVisible();

  // Marking it ready by hand is still gated: pending rights block "Ready for release".
  await details.getByLabel('Operations status').selectOption('ready_for_release');
  await details.getByRole('button', { name: 'Save details' }).click();
  await expect(details.getByRole('alert')).toContainText('clear rights and credit lines for 1 asset');

  await page.getByLabel('Change status for Dock at dawn, Portland').selectOption('cleared');
  await page.getByRole('button', { name: 'Update' }).click();
  await expect(page.getByRole('main').getByText('Next: Review the text')).toBeVisible();

  await details.getByLabel('Operations status').selectOption('ready_for_release');
  await details.getByRole('button', { name: 'Save details' }).click();
  await expect(details.getByRole('status')).toContainText('Story details saved.');
  await expect(page.getByRole('main').getByText('Next: Publish the story')).toBeVisible();
  await expectAccessible(page, `story ${contentId}`);
  await shot(page, testInfo, 'story-ready');

  await page.goto('/stories');
  await expect(page.getByRole('link', { name: subject })).toBeVisible();
  await expectAccessible(page, 'stories list');
  await shot(page, testInfo, 'stories');
});
