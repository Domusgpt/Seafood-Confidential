import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { openDetails, shot, signIn, uniqueSuffix } from './helpers';

// AT-04, AT-06, AT-07, AT-12, AT-13 through the real HTTP gateway and the real desk UI.
test.describe.configure({ mode: 'serial' });

const PRIVATE_CONTACT = 'private-phone-207-555-0100';
let token = '';
let contentId = '';
let suffix = '';

function call(request: APIRequestContext, body: Record<string, unknown>, bearer: string | null = token) {
  return request.post('/api/agent/v1', {
    data: body,
    headers: bearer ? { Authorization: `Bearer ${bearer}` } : {},
    failOnStatusCode: false,
  });
}

const rid = (label: string) => `req-${label}-${suffix}`;

async function addSource(page: Page, code: string, processing: 'yes' | 'no' | 'redacted', contact?: string) {
  await openDetails(page, 'Add a source');
  const form = page.getByRole('form', { name: 'Add a source' });
  await form.getByLabel('Source ID').fill(code);
  await form.getByLabel('Type').selectOption('interview');
  await form.getByLabel('Title', { exact: true }).fill(`Interview notes ${code}`);
  await form.getByLabel('May agents process it?').selectOption(processing);
  if (contact) await form.getByLabel('Private contact').fill(contact);
  await form.getByRole('button', { name: 'Record source' }).click();
  await expect(form.getByRole('status')).toContainText(`Source ${code} recorded.`);
}

test('owner sets up a story, an agent and a grant', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  suffix = uniqueSuffix();
  await signIn(page, 'owner@example.test');
  await page.goto('/stories/new');
  await page.getByLabel('Working title').fill(`Scallop prices explained ${suffix}`);
  await page.getByLabel('Section').selectOption('the_trade');
  await page.getByLabel('Format', { exact: true }).selectOption('explainer');
  await page.getByRole('button', { name: 'Create story' }).click();
  await expect(page).toHaveURL(/\/stories\/SC-\d{4}-\d{3,}$/);
  contentId = /SC-\d{4}-\d{3,}/.exec(page.url())![0];
  await addSource(page, 'SRC-OPEN-01', 'yes');
  await addSource(page, 'SRC-SECRET-01', 'no', PRIVATE_CONTACT);
  await addSource(page, 'SRC-REDACT-01', 'redacted', 'redacted-contact');

  await page.goto('/settings');
  await openDetails(page, 'Create an agent');
  const form = page.getByRole('form', { name: 'Create an agent' });
  await form.getByLabel('Agent name').fill(`Research agent ${suffix}`);
  await form.getByRole('button', { name: 'Create agent and issue token' }).click();
  token = (await form.getByTestId('issued-token').textContent())!.trim();
  expect(token).toMatch(/^sca_[a-z0-9]{8}_[A-Za-z0-9_-]{43}$/);
  await shot(page, testInfo, 'settings-token-issued');

  await page.goto(`/stories/${contentId}`);
  await page.getByLabel('Grant an agent access').selectOption({ label: `Research agent ${suffix}` });
  await page.getByRole('button', { name: 'Grant access' }).click();
  await expect(page.getByRole('main').getByText(`Research agent ${suffix}`).first()).toBeVisible();
});

test('requests without a valid token are rejected and audited', async ({ request }) => {
  const anonymous = await call(
    request,
    { schemaVersion: '1.0', requestId: rid('anon'), tool: 'briefs.list', arguments: {} },
    null,
  );
  expect(anonymous.status()).toBe(401);
  expect(anonymous.headers()['www-authenticate']).toContain('Bearer');
  const forged = await call(
    request,
    { schemaVersion: '1.0', requestId: rid('forged'), tool: 'briefs.list', arguments: {} },
    'sca_aaaaaaaa_' + 'A'.repeat(43),
  );
  expect(forged.status()).toBe(401);
});

test('briefs.list returns only granted briefs', async ({ request }) => {
  const res = await call(request, {
    schemaVersion: '1.0',
    requestId: rid('briefs'),
    tool: 'briefs.list',
    arguments: { limit: 50 },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.ok).toBe(true);
  expect(body.result.briefs.map((b: { briefId: string }) => b.briefId)).toEqual([contentId]);
});

test('AT-06: items.read never exposes staff-only sources or private fields', async ({ request }) => {
  const res = await call(request, {
    schemaVersion: '1.0',
    requestId: rid('read'),
    tool: 'items.read',
    arguments: { itemId: contentId },
  });
  expect(res.status()).toBe(200);
  const text = await res.text();
  expect(text).not.toContain(PRIVATE_CONTACT);
  expect(text).not.toContain('redacted-contact');
  expect(text).not.toContain('SRC-SECRET-01');
  expect(text).not.toMatch(/private_?contact|privateNotes|submitter/i);
  const body = JSON.parse(text);
  expect(body.result.sources).toEqual([
    expect.objectContaining({
      sourceId: 'SRC-OPEN-01',
      redacted: false,
      title: 'Interview notes SRC-OPEN-01',
    }),
    { sourceId: 'SRC-REDACT-01', sourceType: 'interview', redacted: true },
  ]);
});

test('AT-04: publish and export tools do not exist; drafts cannot carry status', async ({ request }) => {
  const publish = await call(request, {
    schemaVersion: '1.0',
    requestId: rid('publish'),
    tool: 'posts.publish',
    arguments: { postId: 'x' },
  });
  expect(publish.status()).toBe(400);
  expect((await publish.json()).error.code).toBe('contract_violation');
  const exportMembers = await call(request, {
    schemaVersion: '1.0',
    requestId: rid('export'),
    tool: 'members.export',
    arguments: {},
  });
  expect(exportMembers.status()).toBe(400);
  const status = await call(request, {
    schemaVersion: '1.0',
    requestId: rid('status'),
    tool: 'drafts.propose',
    idempotencyKey: `idem-status-${suffix}`,
    arguments: {
      briefId: contentId,
      content: { title: 'T', bodyMarkdown: 'B', sourceIds: [], status: 'published' },
    },
  });
  expect(status.status()).toBe(400);
  const principal = await call(request, {
    schemaVersion: '1.0',
    requestId: rid('principal'),
    tool: 'briefs.list',
    principalId: 'owner',
    arguments: {},
  });
  expect(principal.status()).toBe(400);
});

test('identifiers and allow-lists are strict', async ({ request }) => {
  const badId = await call(request, {
    schemaVersion: '1.0',
    requestId: 'req\u202Eevil\u0007bell',
    tool: 'briefs.list',
    arguments: {},
  });
  expect(badId.status()).toBe(400);
  expect((await badId.json()).error.code).toBe('invalid_request_id');

  const proto = await call(request, {
    schemaVersion: '1.0',
    requestId: rid('proto-section'),
    tool: 'drafts.propose',
    idempotencyKey: `idem-proto-${suffix}`,
    arguments: {
      briefId: contentId,
      content: { title: 'T', bodyMarkdown: 'B', section: 'constructor', sourceIds: [] },
    },
  });
  expect(proto.status()).toBe(422);
  expect((await proto.json()).error.code).toBe('unknown_section');

  const notJson = await request.post('/api/agent/v1', {
    data: 'not json',
    headers: { 'Content-Type': 'text/plain', Authorization: `Bearer ${token}` },
    failOnStatusCode: false,
  });
  expect(notJson.status()).toBe(415);
});

test('drafts must cite real, visible sources', async ({ request }) => {
  const res = await call(request, {
    schemaVersion: '1.0',
    requestId: rid('fake-source'),
    tool: 'drafts.propose',
    idempotencyKey: `idem-fake-${suffix}`,
    arguments: {
      briefId: contentId,
      content: { title: 'Draft', bodyMarkdown: 'Body', sourceIds: ['SRC-SECRET-01'] },
    },
  });
  expect(res.status()).toBe(422);
  expect((await res.json()).error.code).toBe('unknown_source_ids');
});

test('AT-12/AT-13: drafts.propose is idempotent and conflicts are explicit', async ({ request }) => {
  const draft = {
    schemaVersion: '1.0',
    tool: 'drafts.propose',
    idempotencyKey: `idem-draft-${suffix}`,
    arguments: {
      briefId: contentId,
      content: {
        title: 'Why scallop prices moved this season',
        summary: 'A plain-language explainer drafted for editor review.',
        bodyMarkdown:
          'DRAFT FOR REVIEW. Landings and prices: see SRC-OPEN-01. <img src=x onerror="window.__pwned=1"><script>window.__pwned=2</script>',
        section: 'the_trade',
        sourceIds: ['SRC-OPEN-01'],
        editorNotes: 'Check the season dates against the source.',
      },
    },
  };
  const first = await call(request, { ...draft, requestId: rid('draft-1') });
  expect(first.status()).toBe(201);
  const created = (await first.json()).result;
  expect(created).toMatchObject({ status: 'proposed', replayed: false });

  const retry = await call(request, { ...draft, requestId: rid('draft-2') });
  expect(retry.status()).toBe(200);
  expect((await retry.json()).result).toMatchObject({ draftId: created.draftId, replayed: true });

  const changed = await call(request, {
    ...draft,
    requestId: rid('draft-3'),
    arguments: { ...draft.arguments, content: { ...draft.arguments.content, title: 'A different title' } },
  });
  expect(changed.status()).toBe(409);
  expect((await changed.json()).error.code).toBe('idempotency_conflict');

  const job = await call(request, {
    schemaVersion: '1.0',
    requestId: rid('job'),
    tool: 'jobs.read',
    arguments: { jobId: created.jobId },
  });
  expect(job.status()).toBe(200);
  expect((await job.json()).result).toMatchObject({ kind: 'draft_proposal', state: 'waiting_for_review' });
});

test('scopes are enforced per tool', async ({ request }) => {
  const res = await call(request, {
    schemaVersion: '1.0',
    requestId: rid('revise'),
    tool: 'drafts.revise',
    idempotencyKey: `idem-revise-${suffix}`,
    arguments: {
      draftId: 'x',
      expectedRevision: '1',
      content: { title: 'T', bodyMarkdown: 'B', sourceIds: [] },
    },
  });
  expect(res.status()).toBe(403);
  expect((await res.json()).error.code).toBe('insufficient_scope');
});

test('the proposal waits for a person; AT-07 revocation is immediate', async ({
  page,
  request,
}, testInfo) => {
  await signIn(page, 'owner@example.test');
  await page.goto(`/stories/${contentId}`);
  await expect(page.getByRole('main').getByText('Next: Review 1 agent draft proposal')).toBeVisible();
  await page.getByRole('main').getByText('Why scallop prices moved this season').click();
  // AT-18 (agent intake): markup in a proposal is shown as text and never executes.
  await expect(page.getByRole('main').getByText('<script>window.__pwned=2</script>')).toBeVisible();
  await expect(page.locator('main img[src="x"], main script')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
  await shot(page, testInfo, 'story-proposal');
  await page.getByRole('button', { name: 'Accept proposal' }).click();
  await expect(page.getByRole('main').getByText(/Reviewed by Morgan Owner/)).toBeVisible();

  await page.goto('/settings');
  const prefix = /^sca_([a-z0-9]{8})_/.exec(token)![1];
  await page.getByRole('button', { name: `Revoke token ${prefix}` }).click();
  await expect(page.getByRole('button', { name: `Revoke token ${prefix}` })).toHaveCount(0);

  const after = await call(request, {
    schemaVersion: '1.0',
    requestId: rid('after-revoke'),
    tool: 'briefs.list',
    arguments: {},
  });
  expect(after.status()).toBe(401);

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Audit trail' })).toBeVisible();
  const auditTable = page.getByRole('table', { name: 'Recent audit events' });
  await expect(auditTable.getByText('agent.authenticate').first()).toBeVisible();
  await expect(auditTable.getByText('agent.drafts.propose').first()).toBeVisible();
  await shot(page, testInfo, 'settings-audit');
});
