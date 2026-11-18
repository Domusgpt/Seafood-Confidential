import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { afterAll, describe, expect, it } from 'vitest';
import { buildSite, storyPath, type SiteConfig, type SiteSnapshot, type SiteStory } from './build';
import { DeployError, FirebaseHostingDestination, LocalDirectoryDestination } from './deploy';
import { KitClient, KitError } from './kit';
import { markdownToHtml, markdownToText } from './markdown';

const config: SiteConfig = {
  siteName: 'Seafood Confidential',
  tagline: 'Seafood, from the people who know it.',
  publicUrl: 'https://news.example.test',
  kitFormId: null,
  pitchUrl: 'https://desk.example.test/pitch',
  builtAt: '2026-11-18T20:00:00.000Z',
};

const story = (patch: Partial<SiteStory> = {}): SiteStory => ({
  contentId: 'SC-2026-014',
  slug: 'how-the-scallop-season-opened-2026-014',
  title: 'How the scallop season opened',
  dek: 'Landings rose and prices eased.',
  bodyMarkdown: '## What happened\n\nLandings **rose**. <script>alert(1)</script>',
  byline: null,
  section: 'the_trade',
  label: 'reporting',
  format: 'explainer',
  aiGenerated: true,
  revision: 1,
  publishedAt: '2026-11-18T15:00:00.000Z',
  updatedAt: '2026-11-18T15:00:00.000Z',
  sources: [
    {
      sourceCode: 'SRC-A',
      title: 'Landings <report>',
      publisher: 'State',
      url: 'https://example.test/a',
      publishedOn: '2026-11-01',
    },
    {
      sourceCode: 'SRC-B',
      title: 'Price sheet',
      publisher: null,
      url: 'javascript:alert(1)',
      publishedOn: null,
    },
  ],
  ...patch,
});

const snapshot = (stories: SiteStory[]): SiteSnapshot => ({
  disclosure: 'An AI agent wrote this story from the sources listed below.',
  stories,
});

const asset = {
  path: '/assets/site.css',
  body: Buffer.from('body{}'),
  contentType: 'text/css; charset=utf-8',
};
const file = (files: { path: string; body: Buffer }[], p: string) =>
  files.find((f) => f.path === p)?.body.toString('utf8');

describe('markdown', () => {
  it('escapes raw HTML, drops unsafe links and keeps the page title the only h1', () => {
    const html = markdownToHtml(
      '# Heading\n\nHi <script>x</script> [bad](javascript:alert(1)) [ok](https://example.test)',
    );
    expect(html).toContain('<h2>Heading</h2>');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('href="javascript:');
    expect(html).toContain('<a href="https://example.test" rel="noopener nofollow">ok</a>');
  });
  it('makes short plain-text descriptions', () => {
    expect(markdownToText('**Bold** and <b>tags</b> & more', 100)).toBe('Bold and <b>tags</b> & more');
    expect(markdownToText('x'.repeat(50), 10)).toHaveLength(10);
  });
});

describe('buildSite', () => {
  const files = buildSite(
    snapshot([
      story(),
      story({
        contentId: 'SC-2026-015',
        slug: 'a-human-story-2026-015',
        title: 'A human story',
        aiGenerated: false,
        label: 'opinion',
        format: 'opinion',
        publishedAt: '2026-11-17T15:00:00.000Z',
        sources: [],
      }),
    ]),
    config,
    [asset],
  );

  it('writes every page type plus the assets', () => {
    const paths = files.map((f) => f.path);
    for (const p of [
      '/index.html',
      '/404.html',
      '/feed.xml',
      '/sitemap.xml',
      '/robots.txt',
      '/sections/the-trade/index.html',
      '/stories/how-the-scallop-season-opened-2026-014/index.html',
      '/stories/a-human-story-2026-015/index.html',
      '/assets/site.css',
    ])
      expect(paths).toContain(p);
  });

  it('labels the agent story and shows the disclosure and sources, escaped', () => {
    const page = file(files, '/stories/how-the-scallop-season-opened-2026-014/index.html')!;
    expect(page).toContain('<h1 class="story__title">How the scallop season opened</h1>');
    expect(page).toContain('Written by an AI agent');
    expect(page).toContain('An AI agent wrote this story from the sources listed below.');
    expect(page).toContain('Landings &lt;report&gt;');
    expect(page).not.toContain('<script>alert(1)</script>');
    expect(page).not.toContain('href="javascript:');
    expect(page).toContain(
      '<link rel="canonical" href="https://news.example.test/stories/how-the-scallop-season-opened-2026-014/">',
    );
    expect(page).toContain('By Seafood Confidential AI desk');
  });

  it("shows labels for opinion and no AI disclosure on a person's story (AT-24)", () => {
    const page = file(files, '/stories/a-human-story-2026-015/index.html')!;
    expect(page).toContain('label--opinion');
    expect(page).not.toContain('How this story was written');
  });

  it('puts the newest story first on the home page and in the feed', () => {
    const home = file(files, '/index.html')!;
    expect(home.indexOf('How the scallop season opened')).toBeLessThan(home.indexOf('A human story'));
    expect(home).toContain('data-bathymetry');
    const feed = file(files, '/feed.xml')!;
    expect(feed).toContain('<guid isPermaLink="false">seafood-confidential:SC-2026-014</guid>');
    expect(feed).toContain('(Written by an AI agent.)');
  });

  it('hides the signup form until Kit is configured, and shows it with a numeric form ID', () => {
    expect(file(files, '/index.html')).not.toContain('app.kit.com/forms');
    const withKit = buildSite(snapshot([story()]), { ...config, kitFormId: '123456' }, [asset]);
    expect(file(withKit, '/index.html')).toContain('action="https://app.kit.com/forms/123456/subscriptions"');
  });

  it('shows a coming-soon page when nothing is published', () => {
    expect(file(buildSite(snapshot([]), config, [asset]), '/index.html')).toContain('Coming soon');
  });

  it('refuses unsafe slugs', () => {
    expect(() => storyPath({ slug: '../etc' })).toThrow(/unsafe slug/);
  });
});

describe('LocalDirectoryDestination', () => {
  const dirs: string[] = [];
  afterAll(async () => Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true }))));

  it('swaps in the complete site atomically and replaces the previous one', async () => {
    const base = await mkdtemp(path.join(os.tmpdir(), 'sc-site-'));
    dirs.push(base);
    const target = path.join(base, 'site');
    const dest = new LocalDirectoryDestination(target);
    const first = await dest.deploy([
      { path: '/index.html', body: Buffer.from('one'), contentType: 'text/html' },
      { path: '/old.html', body: Buffer.from('x'), contentType: 'text/html' },
    ]);
    const second = await dest.deploy([
      { path: '/index.html', body: Buffer.from('two'), contentType: 'text/html' },
    ]);
    expect(first.version).not.toBe(second.version);
    expect(await readFile(path.join(target, 'index.html'), 'utf8')).toBe('two');
    expect((await readdir(target)).sort()).toEqual(['.site-version', 'index.html']);
    expect((await readdir(base)).sort()).toEqual(['site']);
  });

  it('leaves the live site untouched when the claim cannot be confirmed before the swap', async () => {
    const base = await mkdtemp(path.join(os.tmpdir(), 'sc-site-'));
    dirs.push(base);
    const target = path.join(base, 'site');
    const dest = new LocalDirectoryDestination(target);
    await dest.deploy([{ path: '/index.html', body: Buffer.from('live'), contentType: 'text/html' }]);
    const next = [{ path: '/index.html', body: Buffer.from('newer'), contentType: 'text/html' }];
    await expect(
      dest.deploy(next, {
        beforeRelease: async () => {
          throw new Error('claim lost');
        },
      }),
    ).rejects.toMatchObject({ outcomeUnknown: false, message: 'Release stopped: claim lost' });
    const stopped = new AbortController();
    stopped.abort(new Error('Another run took over.'));
    await expect(dest.deploy(next, { signal: stopped.signal })).rejects.toMatchObject({
      outcomeUnknown: false,
      message: 'Another run took over.',
    });
    expect(await readFile(path.join(target, 'index.html'), 'utf8')).toBe('live');
    expect((await readdir(base)).sort()).toEqual(['site']);
  });

  it('refuses paths that escape the site directory', async () => {
    const base = await mkdtemp(path.join(os.tmpdir(), 'sc-site-'));
    dirs.push(base);
    await expect(
      new LocalDirectoryDestination(path.join(base, 'site')).deploy([
        { path: '/../escape.html', body: Buffer.from('x'), contentType: 'text/html' },
      ]),
    ).rejects.toBeInstanceOf(DeployError);
  });
});

describe('FirebaseHostingDestination', () => {
  const files = [
    { path: '/index.html', body: Buffer.from('<p>home</p>'), contentType: 'text/html' },
    { path: '/assets/site.css', body: Buffer.from('body{}'), contentType: 'text/css' },
  ];

  function fake(fail?: { step: string; status: number }) {
    const calls: { method: string; url: string; body: unknown }[] = [];
    const impl = (async (url: string, init: RequestInit) => {
      const method = init.method ?? 'GET';
      const step = url.includes('/releases')
        ? 'release'
        : url.includes(':populateFiles')
          ? 'populate'
          : url.includes('/upload/')
            ? 'upload'
            : method === 'PATCH'
              ? 'finalize'
              : 'version';
      calls.push({
        method,
        url,
        body: init.body instanceof Uint8Array ? init.body : init.body ? JSON.parse(String(init.body)) : null,
      });
      if (fail?.step === step)
        return new Response(JSON.stringify({ error: { message: 'nope' } }), { status: fail.status });
      if (step === 'version') return new Response(JSON.stringify({ name: 'sites/sc-news/versions/v1' }));
      if (step === 'populate') {
        const hashes = Object.values((calls.at(-1)!.body as { files: Record<string, string> }).files);
        return new Response(
          JSON.stringify({
            uploadRequiredHashes: [hashes[0]],
            uploadUrl: 'https://upload-firebasehosting.googleapis.com/upload/sites/sc-news/versions/v1/files',
          }),
        );
      }
      return new Response('{}');
    }) as unknown as typeof fetch;
    return { calls, impl };
  }

  it('creates a version, lists every file by the hash of its gzip, uploads only what is missing, finalizes and releases', async () => {
    const { calls, impl } = fake();
    const dest = new FirebaseHostingDestination({
      siteId: 'sc-news',
      getAccessToken: async () => 'token',
      fetch: impl,
    });
    const out = await dest.deploy(files);
    expect(out.version).toBe('sites/sc-news/versions/v1');
    expect(calls.map((c) => c.method)).toEqual(['POST', 'POST', 'POST', 'PATCH', 'POST']);
    const listed = (calls[1].body as { files: Record<string, string> }).files;
    expect(Object.keys(listed).sort()).toEqual(['/assets/site.css', '/index.html']);
    const uploaded = calls[2].body as Uint8Array;
    expect(gunzipSync(uploaded).toString()).toBe('<p>home</p>');
    expect(createHash('sha256').update(uploaded).digest('hex')).toBe(listed['/index.html']);
    expect(calls[3].url).toContain('update_mask=status');
    expect(calls[4].url).toContain('versionName=sites%2Fsc-news%2Fversions%2Fv1');
    const config = (calls[0].body as { config: { headers: { headers: Record<string, string> }[] } }).config;
    expect(config.headers[0].headers['Content-Security-Policy']).toContain("frame-ancestors 'none'");
  });

  it('treats a failed release as uncertain and an earlier failure as certain', async () => {
    const release = new FirebaseHostingDestination({
      siteId: 'sc-news',
      getAccessToken: async () => 't',
      fetch: fake({ step: 'release', status: 503 }).impl,
    });
    await expect(release.deploy(files)).rejects.toMatchObject({ outcomeUnknown: true });
    const populate = new FirebaseHostingDestination({
      siteId: 'sc-news',
      getAccessToken: async () => 't',
      fetch: fake({ step: 'populate', status: 403 }).impl,
    });
    await expect(populate.deploy(files)).rejects.toMatchObject({ outcomeUnknown: false });
  });

  it('confirms the claim right before releasing, and never releases without it', async () => {
    const { calls, impl } = fake();
    const order: string[] = [];
    const dest = new FirebaseHostingDestination({
      siteId: 'sc-news',
      getAccessToken: async () => 't',
      fetch: impl,
    });
    await dest.deploy(files, {
      beforeRelease: async () => {
        order.push(`confirm after ${calls.length} calls`);
      },
    });
    expect(order).toEqual(['confirm after 4 calls']);

    const lost = fake();
    const refused = new FirebaseHostingDestination({
      siteId: 'sc-news',
      getAccessToken: async () => 't',
      fetch: lost.impl,
    });
    await expect(
      refused.deploy(files, {
        beforeRelease: async () => {
          throw new Error('claim lost');
        },
      }),
    ).rejects.toMatchObject({ outcomeUnknown: false });
    expect(lost.calls.some((c) => c.url.includes('/releases'))).toBe(false);
  });

  it('stops before the release when the claim is lost mid-upload', async () => {
    const stop = new AbortController();
    const inner = fake();
    const impl = (async (url: string, init: RequestInit) => {
      const res = await inner.impl(url, init);
      if (url.includes('/upload/')) stop.abort(new Error('Another run took over.'));
      return res;
    }) as unknown as typeof fetch;
    const dest = new FirebaseHostingDestination({
      siteId: 'sc-news',
      getAccessToken: async () => 't',
      fetch: impl,
    });
    await expect(dest.deploy(files, { signal: stop.signal })).rejects.toMatchObject({
      outcomeUnknown: false,
      message: 'Another run took over.',
    });
    expect(inner.calls.some((c) => c.url.includes('/releases'))).toBe(false);
  });
});

describe('KitClient', () => {
  it('sends a scheduled, non-public broadcast with the API key header and an optional segment', async () => {
    let seen: { url: string; headers: Record<string, string>; body: Record<string, unknown> } | undefined;
    const kit = new KitClient('kit_test_key_0123456789', {
      fetch: (async (url: string, init: RequestInit) => {
        seen = { url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) };
        return new Response(JSON.stringify({ broadcast: { id: 42 } }), { status: 201 });
      }) as unknown as typeof fetch,
    });
    const out = await kit.createBroadcast({
      subject: 'S',
      previewText: 'P',
      html: '<p>x</p>',
      description: 'SC-2026-014',
      sendAt: new Date('2026-11-18T20:03:00Z'),
      segmentId: 7,
    });
    expect(out.id).toBe('42');
    expect(seen!.url).toBe('https://api.kit.com/v4/broadcasts');
    expect(seen!.headers['X-Kit-Api-Key']).toBe('kit_test_key_0123456789');
    expect(seen!.body).toMatchObject({
      subject: 'S',
      public: false,
      send_at: '2026-11-18T20:03:00.000Z',
      subscriber_filter: [{ all: [{ type: 'segment', ids: [7] }] }],
    });
  });

  it('marks refusals as certain and lost connections as uncertain (never resend)', async () => {
    const refused = new KitClient('kit_test_key_0123456789', {
      fetch: (async () =>
        new Response(JSON.stringify({ errors: ['Content is invalid'] }), {
          status: 422,
        })) as unknown as typeof fetch,
    });
    await expect(
      refused.createBroadcast({
        subject: 'S',
        previewText: '',
        html: '',
        description: '',
        sendAt: new Date(),
      }),
    ).rejects.toMatchObject({ message: 'Content is invalid', outcomeUnknown: false });
    const lost = new KitClient('kit_test_key_0123456789', {
      fetch: (async () => {
        throw new Error('socket hang up');
      }) as unknown as typeof fetch,
    });
    const error = await lost
      .createBroadcast({ subject: 'S', previewText: '', html: '', description: '', sendAt: new Date() })
      .catch((e) => e);
    expect(error).toBeInstanceOf(KitError);
    expect(error.outcomeUnknown).toBe(true);
  });
});
