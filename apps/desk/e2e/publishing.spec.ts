import {
  expect,
  test,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Page,
  type TestInfo,
} from '@playwright/test';
import sharp from 'sharp';
import { expectAccessible, openDetails, shot, signIn, SITE, uniqueSuffix } from './helpers';

// ADR-005 through the real desk, the real gateway and the real (local) public site:
// people write and publish (AT-08), agents publish on their own only inside the owner's switches
// and checks (AT-27, AT-28), human work wins (AT-29), the master switch stops agents (AT-30), and
// unpublishing takes the page down.
test.describe.configure({ mode: 'serial' });

let suffix = '';
let token = '';
// Sign in once per role and reuse the session (the auth service rate-limits sign-ins per address).
type State = Awaited<ReturnType<BrowserContext['storageState']>>;
const sessions: Partial<Record<'owner' | 'editor', State>> = {};

async function as(role: 'owner' | 'editor', browser: Browser, testInfo: TestInfo): Promise<Page> {
  if (!sessions[role]) {
    const ctx = await browser.newContext({ ...testInfo.project.use });
    const page = await ctx.newPage();
    await signIn(page, `${role}@example.test`);
    sessions[role] = await ctx.storageState();
    return page;
  }
  const ctx = await browser.newContext({ ...testInfo.project.use, storageState: sessions[role] });
  return ctx.newPage();
}
const stories: Record<'agent' | 'human' | 'switch', string> = { agent: '', human: '', switch: '' };

const BODY = `Scallop landings in the Gulf of Maine rose in the first weeks of the season, according to the landings report, and boats that sat out a slow start came back to the water.

## What the numbers show

Dockside prices eased as supply recovered. The weekly price sheet shows a gradual decline through the month, which matches what processors expected after the slow opening.

Boat owners should watch fuel costs and the weather, which together decide how many trips are worth making in the coldest weeks of the year.`;

function call(request: APIRequestContext, body: Record<string, unknown>) {
  return request.post('/api/agent/v1', {
    data: { schemaVersion: '1.0', ...body },
    headers: { Authorization: `Bearer ${token}` },
    failOnStatusCode: false,
  });
}
const rid = (label: string) => `req-${label}-${suffix}`;

async function newStory(page: Page, title: string): Promise<string> {
  await page.goto('/stories/new');
  await page.getByLabel('Working title').fill(title);
  await page.getByLabel('Section').selectOption('the_trade');
  await page.getByLabel('Format', { exact: true }).selectOption('explainer');
  await page.getByRole('button', { name: 'Create story' }).click();
  await expect(page).toHaveURL(/\/stories\/SC-\d{4}-\d{3,}$/);
  return /SC-\d{4}-\d{3,}/.exec(page.url())![0];
}

async function addCitableSource(page: Page, code: string, title: string) {
  await openDetails(page, 'Add a source');
  const form = page.getByRole('form', { name: 'Add a source' });
  await form.getByLabel('Source ID').fill(code);
  await form.getByLabel('Type').selectOption('official_document');
  await form.getByLabel('Title', { exact: true }).fill(title);
  await form.getByLabel('Address').fill('https://example.test/landings');
  await form.getByLabel('May agents process it?').selectOption('yes');
  await form.getByLabel(/Cite it publicly/).check();
  await form.getByRole('button', { name: 'Record source' }).click();
  await expect(form.getByRole('status')).toContainText(`Source ${code} recorded.`);
}

async function grant(page: Page, contentId: string) {
  await page.goto(`/stories/${contentId}`);
  await page.getByLabel('Grant an agent access').selectOption({ label: `Desk agent ${suffix}` });
  await page.getByRole('button', { name: 'Grant access' }).click();
  await expect(page.getByRole('main').getByText(`Desk agent ${suffix}`).first()).toBeVisible();
}

/** The agent's full path: read the brief, propose a draft, publish it. Returns the publish response. */
async function agentPublishes(request: APIRequestContext, contentId: string, label: string) {
  const read = await call(request, {
    requestId: rid(`read-${label}`),
    tool: 'items.read',
    arguments: { itemId: contentId },
  });
  expect(read.status()).toBe(200);
  const sourceIds = ((await read.json()).result.sources as { sourceId: string; redacted: boolean }[])
    .filter((s) => !s.redacted)
    .map((s) => s.sourceId);
  const proposed = await call(request, {
    requestId: rid(`propose-${label}`),
    idempotencyKey: `idem-propose-${label}-${suffix}`,
    tool: 'drafts.propose',
    arguments: {
      briefId: contentId,
      content: {
        title: `How the scallop season opened ${suffix}`,
        summary: 'Landings rose and prices eased.',
        bodyMarkdown: BODY,
        sourceIds,
      },
    },
  });
  expect(proposed.status()).toBe(201);
  const draftId = (await proposed.json()).result.draftId as string;
  return call(request, {
    requestId: rid(`publish-${label}`),
    idempotencyKey: `idem-publish-${label}-${suffix}`,
    tool: 'drafts.publish',
    arguments: { draftId, sendEmail: false },
  });
}

test('the owner opens a lane for agents and issues a publishing token', async ({ browser }, testInfo) => {
  test.setTimeout(150_000);
  suffix = uniqueSuffix();
  const page = await as('owner', browser, testInfo);

  await page.goto('/settings');
  await openDetails(page, 'Change publishing settings');
  const policy = page.getByRole('form', { name: 'Publishing settings' });
  await policy.getByLabel('Agents may publish on their own').check();
  await policy.getByRole('group', { name: 'Sections open to agents' }).getByLabel('The Trade').check();
  await policy.getByLabel('Agent publications per day, at most').fill('20');
  await policy.getByRole('button', { name: 'Save publishing settings' }).click();
  await expect(policy.getByRole('status')).toContainText('Publishing settings saved.');

  await openDetails(page, 'Create an agent');
  const form = page.getByRole('form', { name: 'Create an agent' });
  await form.getByLabel('Agent name').fill(`Desk agent ${suffix}`);
  await form.getByLabel(/Publish its own proposals/).check();
  await form.getByRole('button', { name: 'Create agent and issue token' }).click();
  token = (await form.getByTestId('issued-token').textContent())!.trim();
  expect(token).toMatch(/^sca_[a-z0-9]{8}_[A-Za-z0-9_-]{43}$/);
  await expectAccessible(page, 'settings with publishing');
  await shot(page, testInfo, 'settings-publishing');

  for (const key of Object.keys(stories) as (keyof typeof stories)[]) {
    stories[key] = await newStory(page, `Scallop season ${key} ${suffix}`);
    await addCitableSource(page, 'SRC-LANDINGS-01', 'Weekly landings report');
    await addCitableSource(page, 'SRC-PRICES-01', 'Dockside price sheet');
    await grant(page, stories[key]);
  }
});

test('AT-27: an agent publishes inside its lane, labelled, with its sources', async ({
  request,
  page,
  browser,
}, testInfo) => {
  const res = await agentPublishes(request, stories.agent, 'agent');
  const body = await res.json();
  expect(res.status(), JSON.stringify(body)).toBe(201);
  expect(body.result.state).toBe('succeeded');
  const url = body.result.publicUrl as string;
  expect(url).toMatch(new RegExp(`^${SITE}/stories/how-the-scallop-season-opened-`));

  await page.goto(url);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(`How the scallop season opened ${suffix}`);
  await expect(page.getByText('Written by an AI agent').first()).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'How this story was written' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sources' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Weekly landings report' })).toBeVisible();
  await expectAccessible(page, 'public agent story');
  await shot(page, testInfo, 'public-agent-story');
  await page.goto(`${SITE}/`);
  await expect(page.getByRole('link', { name: `How the scallop season opened ${suffix}` })).toBeVisible();
  await expectAccessible(page, 'public home');
  await shot(page, testInfo, 'public-home');
  const feed = await (await request.get(`${SITE}/feed.xml`)).text();
  expect(feed).toContain(`How the scallop season opened ${suffix}`);

  // The desk shows who published it.
  const desk = await as('owner', browser, testInfo);
  await desk.goto(`/stories/${stories.agent}`);
  await expect(desk.getByTestId('publish-state')).toContainText(`by the agent Desk agent ${suffix}`);
  await shot(desk, testInfo, 'story-published-by-agent');
});

test('AT-29: once a person has written a story, the agent cannot publish it', async ({
  request,
  browser,
}, testInfo) => {
  const page = await as('owner', browser, testInfo);
  await page.goto(`/stories/${stories.human}`);
  const text = page.getByRole('form', { name: 'Story text' });
  await text.getByLabel('Story', { exact: true }).fill('A person started this story.');
  await text.getByRole('button', { name: 'Save the text' }).click();
  await expect(text.getByRole('status')).toContainText('Saved as revision 1.');

  const res = await agentPublishes(request, stories.human, 'human');
  expect(res.status()).toBe(422);
  const body = await res.json();
  expect(body.error.code).toBe('publish_refused');
  expect(body.error.details.failedChecks.map((c: { check: string }) => c.check)).toContain(
    'brief_untouched_by_people',
  );
  // The refusal is recorded (it counts against the agent's daily refusal budget) and reads back.
  const read = await call(request, {
    requestId: rid('read-refused'),
    tool: 'jobs.read',
    arguments: { jobId: body.error.details.jobId },
  });
  expect(read.status()).toBe(200);
  const job = (await read.json()).result;
  expect(job.state).toBe('refused');
  expect(job.failedChecks.map((c: { check: string }) => c.check)).toContain('brief_untouched_by_people');
});

test('AT-08: a save from an old revision is refused and the newer text is kept', async ({
  browser,
}, testInfo) => {
  const a = await as('owner', browser, testInfo);
  const b = await as('editor', browser, testInfo);
  await a.goto(`/stories/${stories.human}`);
  await b.goto(`/stories/${stories.human}`);
  const formB = b.getByRole('form', { name: 'Story text' });
  await formB.getByLabel('Story', { exact: true }).fill('The editor saved first.');
  await formB.getByRole('button', { name: 'Save the text' }).click();
  await expect(formB.getByRole('status')).toContainText('Saved as revision 2.');
  const formA = a.getByRole('form', { name: 'Story text' });
  await formA.getByLabel('Story', { exact: true }).fill('The owner saved from an old page.');
  await formA.getByRole('button', { name: 'Save the text' }).click();
  await expect(formA.getByRole('alert')).toContainText('Someone saved a newer version');
  await a.reload();
  await expect(a.getByRole('form', { name: 'Story text' }).getByLabel('Story', { exact: true })).toHaveValue(
    'The editor saved first.',
  );
});

test('a person publishes, updates and unpublishes; warnings never block (ADR-005)', async ({
  request,
  browser,
}, testInfo) => {
  const page = await as('owner', browser, testInfo);
  await page.goto(`/stories/${stories.human}`);
  const text = page.getByRole('form', { name: 'Story text' });
  await text.getByLabel('Headline', { exact: true }).fill(`A person wrote this ${suffix}`);
  await text.getByLabel('Story', { exact: true }).fill(BODY);
  await text.getByLabel(/SRC-LANDINGS-01/).check();
  await text.getByRole('button', { name: 'Save the text' }).click();
  await expect(text.getByRole('status')).toContainText('Saved as revision 3.');

  await openDetails(page, 'Add a rights record');
  const rights = page.getByRole('form', { name: 'Add a rights record' });
  await rights.getByLabel('Asset', { exact: true }).fill('Harbor photo');
  await rights.getByLabel('Kind', { exact: true }).selectOption('photo');
  await rights.getByLabel('Provenance').selectOption('documentary');
  await rights.getByRole('button', { name: 'Save rights record' }).click();
  await expect(rights.getByRole('status')).toContainText('saved');

  const publish = page.getByRole('form', { name: 'Publish this story' });
  await publish.getByRole('button', { name: 'Publish now' }).click();
  const confirm = page.getByRole('form', { name: 'Confirm publication' });
  await expect(confirm.getByRole('alert')).toContainText('not cleared');
  await shot(page, testInfo, 'publish-warning');
  await confirm.getByRole('button', { name: 'Publish anyway' }).click();
  await expect(page.getByRole('form', { name: 'Publish this story' }).getByRole('status')).toContainText(
    'Published.',
  );
  await page.reload();
  const url = (await page.getByTestId('public-url').textContent())!.trim();
  const live = await request.get(url);
  expect(live.status()).toBe(200);
  const html = await live.text();
  expect(html).toContain(`A person wrote this ${suffix}`);
  // The story itself carries no AI label (related stories further down may be agents' own work).
  const start = html.indexOf('<article class="story');
  expect(html.slice(start, html.indexOf('</article>', start))).not.toContain('Written by an AI agent');
  expect(live.headers()['content-security-policy']).toContain("default-src 'self'");

  // Edit, then update the live page.
  await page
    .getByRole('form', { name: 'Story text' })
    .getByLabel('Headline', { exact: true })
    .fill(`A person wrote this, corrected ${suffix}`);
  await page.getByRole('form', { name: 'Story text' }).getByRole('button', { name: 'Save the text' }).click();
  await expect(page.getByRole('main').getByText('Next: Update the published story')).toBeVisible();
  await page
    .getByRole('form', { name: 'Publish this story' })
    .getByRole('button', { name: 'Update the published story' })
    .click();
  // Every publication lists open warnings again (the photo is still not cleared); one click goes ahead.
  await page
    .getByRole('form', { name: 'Confirm publication' })
    .getByRole('button', { name: 'Publish anyway' })
    .click();
  await expect(page.getByRole('form', { name: 'Publish this story' }).getByRole('status')).toContainText(
    'Updated the published story.',
  );
  expect(await (await request.get(url)).text()).toContain(`A person wrote this, corrected ${suffix}`);
  await expectAccessible(page, 'story publishing panel');
  await shot(page, testInfo, 'story-publishing-panel');

  // Unpublish takes the page down.
  await page
    .getByRole('form', { name: 'Publish this story' })
    .getByRole('button', { name: 'Unpublish' })
    .click();
  await expect(page.getByRole('form', { name: 'Publish this story' }).getByRole('status')).toContainText(
    'Unpublished.',
  );
  expect((await request.get(url)).status()).toBe(404);
});

test('a person adds a photograph; it goes live with its credit, in AVIF and WebP (v0.7.0)', async ({
  request,
  browser,
}, testInfo) => {
  const page = await as('owner', browser, testInfo);
  const contentId = await newStory(page, `A story with a photograph ${suffix}`);
  const text = page.getByRole('form', { name: 'Story text' });
  await text.getByLabel('Headline', { exact: true }).fill(`A story with a photograph ${suffix}`);
  await text.getByLabel('Story', { exact: true }).fill(BODY);
  await text.getByRole('button', { name: 'Save the text' }).click();
  await expect(text.getByRole('status')).toContainText('Saved as revision 1.');

  // The image needs a rights record first: cleared for the web, with a credit line.
  await expect(page.locator('#image')).toContainText('First add a rights record');
  await openDetails(page, 'Add a rights record');
  const rights = page.getByRole('form', { name: 'Add a rights record' });
  await rights.getByLabel('Asset', { exact: true }).fill('Dock at dawn');
  await rights.getByLabel('Kind', { exact: true }).selectOption('photo');
  await rights.getByLabel('Provenance').selectOption('documentary');
  await rights.getByLabel('Credit line').fill(`Photo: E2E fixture ${suffix} (public domain)`);
  await rights.getByLabel('Web', { exact: true }).check();
  await rights.getByLabel('Status').selectOption('cleared');
  await rights.getByRole('button', { name: 'Save rights record' }).click();
  await expect(rights.getByRole('status')).toContainText('saved');

  // Upload: an ordinary form post (works without JavaScript); location data never survives.
  await page.reload();
  const jpeg = await sharp({
    create: { width: 900, height: 600, channels: 3, background: { r: 44, g: 90, b: 112 } },
  })
    .withExif({ IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '43/1 39/1 0/1' } })
    .jpeg()
    .toBuffer();
  const upload = page.getByRole('form', { name: 'Add a lead image' });
  await upload
    .getByLabel('Image file')
    .setInputFiles({ name: 'dock.jpg', mimeType: 'image/jpeg', buffer: jpeg });
  await upload.getByLabel('Alternative text').fill('A fishing boat tied up at a dock at dawn');
  await upload.getByLabel(/Caption/).fill('The dock at dawn.');
  await upload.getByLabel('Keep in frame').selectOption('bottom');
  await upload.getByRole('button', { name: 'Add image' }).click();
  await expect(page).toHaveURL(new RegExp(`/stories/${contentId}\\?image=attached#image$`));
  const card = page.locator('#image');
  await expect(card.getByRole('status')).toContainText('Image attached.');
  const preview = card.getByRole('img', { name: 'A fishing boat tied up at a dock at dawn' });
  await expect(preview).toBeVisible();
  expect(await preview.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await expectAccessible(page, 'lead image card');
  await shot(page, testInfo, 'story-lead-image');

  // Publish: the page shows the photograph with its credit, served as AVIF and WebP.
  await page
    .getByRole('form', { name: 'Publish this story' })
    .getByRole('button', { name: 'Publish now' })
    .click();
  // Warnings (no sources yet) come back first; one click goes ahead (ADR-005).
  const confirm = page.getByRole('form', { name: 'Confirm publication' });
  const done = page.getByRole('form', { name: 'Publish this story' }).getByRole('status');
  await expect(confirm.or(done)).toBeVisible();
  if (await confirm.isVisible()) await confirm.getByRole('button', { name: 'Publish anyway' }).click();
  await expect(done).toContainText('Published.');
  await page.reload();
  const url = (await page.getByTestId('public-url').textContent())!.trim();
  const html = await (await request.get(url)).text();
  expect(html).toContain('<picture><source type="image/avif"');
  expect(html).toContain('alt="A fishing boat tied up at a dock at dawn"');
  expect(html).toContain(`Photo: E2E fixture ${suffix} (public domain)`);
  expect(html).toContain('class="fx-2 fy-3"');
  for (const format of ['avif', 'webp']) {
    const src = new RegExp(`/media/[0-9a-f]{32}\\.${format}`).exec(html)![0];
    const file = await request.get(`${SITE}${src}`);
    expect(file.status()).toBe(200);
    expect(file.headers()['content-type']).toBe(`image/${format}`);
    const meta = await sharp(Buffer.from(await file.body())).metadata();
    expect(meta.exif).toBeUndefined();
  }
});

test('AT-30: the master switch stops agents at once', async ({ request, browser }, testInfo) => {
  const page = await as('editor', browser, testInfo);
  await page.goto('/publishing');
  await expect(page.getByRole('heading', { level: 1, name: 'Publishing' })).toBeVisible();
  await page.getByRole('button', { name: 'Stop agent publishing' }).click();
  await expect(page.getByRole('link', { name: 'Agent publishing is off' })).toBeVisible();
  await expectAccessible(page, 'publishing log');
  await shot(page, testInfo, 'publishing-log');

  const res = await agentPublishes(request, stories.switch, 'switch');
  expect(res.status()).toBe(422);
  expect((await res.json()).error.details.failedChecks.map((c: { check: string }) => c.check)).toContain(
    'master_switch',
  );
});
