import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { afterAll, describe, expect, it } from 'vitest';
import {
  buildSite,
  mediaPath,
  mediaRefs,
  storyPath,
  type SiteConfig,
  type SiteImage,
  type SiteSnapshot,
  type SiteStory,
} from './build';
import { DeployError, FirebaseHostingDestination, LocalDirectoryDestination } from './deploy';
import { parseSitePage } from './assets';
import { KitClient, KitError } from './kit';
import { markdownToHtml, markdownToText, typeset } from './markdown';

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
  it('starts the highest heading a writer used at h2, without skipping levels', () => {
    expect(markdownToHtml('## Section\n\n### Detail')).toBe('<h2>Section</h2>\n<h3>Detail</h3>');
    expect(markdownToHtml('# Section\n\n## Detail')).toBe('<h2>Section</h2>\n<h3>Detail</h3>');
    expect(markdownToHtml('###### Deep')).toBe('<h2>Deep</h2>');
  });
  it('sets in-word apostrophes typographically in titles, leaving other quotes alone', () => {
    expect(typeset("A day boat's day, 'quoted' and O'Neill's")).toBe(
      "A day boat’s day, 'quoted' and O’Neill’s",
    );
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
    // Only offer to subscribe when there is a form to subscribe with.
    expect(file(buildSite(snapshot([]), config, [asset]), '/index.html')).not.toContain('Subscribe');
    expect(
      file(buildSite(snapshot([]), { ...config, kitFormId: '123456' }, [asset]), '/index.html'),
    ).toContain('Subscribe to hear when they land.');
  });

  it('marks a preview build on every page and keeps it out of search engines', () => {
    const text = (fs: typeof files, p: string) => fs.find((f) => f.path === p)!.body.toString('utf8');
    const preview = buildSite(
      snapshot([story()]),
      { ...config, preview: 'Not launched yet <test>: stories here are tests.' },
      [asset],
    );
    for (const page of [
      '/index.html',
      '/404.html',
      '/stories/how-the-scallop-season-opened-2026-014/index.html',
    ]) {
      const html = text(preview, page);
      expect(html).toContain('<meta name="robots" content="noindex, nofollow">');
      expect(html).toContain(
        '<strong>Preview.</strong> Not launched yet &lt;test&gt;: stories here are tests.',
      );
    }
    expect(text(preview, '/robots.txt')).toBe('User-agent: *\nDisallow: /\n');
    // The real site is unchanged.
    expect(text(files, '/index.html')).not.toContain('noindex');
    expect(text(files, '/index.html')).not.toContain('preview-banner');
    expect(text(files, '/robots.txt')).toContain('Allow: /');
  });

  it('labels sample stories everywhere, and refuses to put them on a site that is not a preview', () => {
    const sample = story({ isSample: true, aiGenerated: false, sources: [] });
    const preview = buildSite(snapshot([sample]), { ...config, preview: 'Not launched yet.' }, [asset]);
    const page = file(preview, `${storyPath(sample)}index.html`)!;
    expect(page).toContain('<span class="label label--sample">Sample</span>');
    expect(page).toContain('<strong>Sample story.</strong>');
    expect(file(preview, '/index.html')).toContain('label--sample');
    expect(file(preview, '/feed.xml')).toContain('<title>Sample: How the scallop season opened</title>');
    expect(() => buildSite(snapshot([sample]), config, [asset])).toThrow(/only appear on a preview site/);
    // A real story on a real site carries none of it.
    expect(file(files, '/index.html')).not.toContain('label--sample');
  });

  it('renders the standing pages with footer links, a sitemap entry and the pitch link filled in', () => {
    const about = parseSitePage(
      'about.md',
      '---\ntitle: About us\ndescription: Who we are.\norder: 1\n---\n## Who\n\nSee [how we work](/how-we-work/) or [pitch]({{pitch_url}}). [Off-site](//evil.example)',
    );
    const how = parseSitePage(
      'how-we-work.md',
      '---\ntitle: How we work\ndescription: Standards.\norder: 2\n---\nText.',
    );
    const built = buildSite(snapshot([]), config, [asset], [how, about]);
    const page = file(built, '/about/index.html')!;
    expect(page).toContain('<h1 class="story__title">About us</h1>');
    expect(page).toContain('<h2>Who</h2>');
    expect(page).toContain('<a href="/how-we-work/">how we work</a>');
    expect(page).toContain('<a href="https://desk.example.test/pitch" rel="noopener nofollow">pitch</a>');
    expect(page).not.toContain('href="//evil.example"');
    const home = file(built, '/index.html')!;
    expect(home.indexOf('href="/about/">About us</a>')).toBeLessThan(
      home.indexOf('href="/how-we-work/">How we work</a>'),
    );
    expect(file(built, '/sitemap.xml')).toContain('https://news.example.test/how-we-work/');
    expect(() => buildSite(snapshot([]), config, [asset], [{ ...about, slug: 'stories' }])).toThrow(
      /unsafe page slug/,
    );
    expect(() => parseSitePage('x.md', 'no front matter')).toThrow(/front matter/);
  });

  it('refuses unsafe slugs', () => {
    expect(() => storyPath({ slug: '../etc' })).toThrow(/unsafe slug/);
  });
});

describe('story images and motion (v0.7.0)', () => {
  const bytes = (seed: string) => Buffer.from(`image bytes ${seed}`);
  const hash = (b: Buffer) => createHash('sha256').update(b).digest('hex');
  const variant = (seed: string, format: 'avif' | 'webp', width: number) => {
    const body = bytes(`${seed}-${format}-${width}`);
    return { v: { format, width, height: Math.round((width * 2) / 3), sha256: hash(body) }, body };
  };
  const made = [
    variant('a', 'avif', 480),
    variant('a', 'webp', 480),
    variant('a', 'avif', 1200),
    variant('a', 'webp', 1200),
  ];
  const image: SiteImage = {
    id: '6d2b79f5-0000-4000-8000-000000000001',
    alt: 'A fishing boat tied up at a dock',
    caption: 'A boat at the dock <b>early</b>.',
    credit: 'Photo: Fixture (public domain)',
    provenance: 'documentary',
    kind: 'photo',
    width: 1200,
    height: 800,
    focalX: 0.7,
    focalY: 0.2,
    variants: made.map((m) => m.v),
  };
  const media = made.map((m) => ({
    path: mediaPath(m.v),
    body: m.body,
    contentType: 'application/octet-stream',
  }));
  const withImage = story({ aiGenerated: false, heroImage: image });
  const other = story({
    contentId: 'SC-2026-016',
    slug: 'another-story-2026-016',
    title: 'Another story',
    aiGenerated: false,
  });
  const files = buildSite(snapshot([withImage, other]), config, [asset], [], media);
  const page = file(files, '/stories/how-the-scallop-season-opened-2026-014/index.html')!;

  it('serves each rendition at a content-addressed path, and lists exactly the files pages use', () => {
    expect(mediaPath(made[0].v)).toBe(`/media/${made[0].v.sha256.slice(0, 32)}.avif`);
    expect(() => mediaPath({ sha256: 'not-a-hash', format: 'webp' })).toThrow(/unsafe media hash/);
    expect(
      mediaRefs(snapshot([withImage, other]))
        .map((r) => r.path)
        .sort(),
    ).toEqual(media.map((m) => m.path).sort());
    for (const m of media) {
      const out = files.find((f) => f.path === m.path)!;
      expect(out.contentType).toBe(m.path.endsWith('.avif') ? 'image/avif' : 'image/webp');
    }
  });

  it('puts the photograph on the story page with its alt text, caption and credit, AVIF first', () => {
    expect(page).toMatch(/<picture><source type="image\/avif" srcset="[^"]+ 480w, [^"]+ 1200w"/);
    expect(page).toContain('alt="A fishing boat tied up at a dock"');
    expect(page).toContain('fetchpriority="high"');
    expect(page).toContain('class="fx-3 fy-1"');
    expect(page).toContain('A boat at the dock &lt;b&gt;early&lt;/b&gt;.');
    expect(page).toContain('<span class="credit">Photo: Fixture (public domain)</span>');
    expect(page).toContain('<meta property="og:image" content="https://news.example.test/media/');
    expect(page).not.toContain('Generated image');
  });

  it('keeps card images decorative and lazy, and draws a plate for a story without one', () => {
    const home = file(files, '/index.html')!;
    expect(home).toContain('alt="" class="fx-3 fy-1" decoding="async" fetchpriority="high"');
    const section = file(files, '/sections/the-trade/index.html')!;
    expect(section).toContain('loading="lazy"');
    expect(section).toContain('<div class="plate plate--the-trade" aria-hidden="true">');
  });

  it('labels illustrations and generated images', () => {
    const generated = buildSite(
      snapshot([story({ heroImage: { ...image, provenance: 'generated' } })]),
      config,
      [asset],
      [],
      media,
    );
    expect(file(generated, '/stories/how-the-scallop-season-opened-2026-014/index.html')).toContain(
      'Generated image',
    );
  });

  it('refuses to build when an image file is missing or does not match its hash', () => {
    expect(() => buildSite(snapshot([withImage]), config, [asset], [], media.slice(1))).toThrow(
      /missing image file/,
    );
    const swapped = media.map((m, i) => (i === 0 ? { ...m, body: Buffer.from('substituted') } : m));
    expect(() => buildSite(snapshot([withImage]), config, [asset], [], swapped)).toThrow(
      /does not match its hash/,
    );
  });

  it('links related stories, the same section first, never the story itself', () => {
    expect(page).toContain('More from the waterfront');
    expect(page).toContain('href="/stories/another-story-2026-016/"');
    expect(page.match(/href="\/stories\/how-the-scallop-season-opened-2026-014\/"/g)).toBeNull();
  });

  it('ships the motion system with its preset, and a reading estimate', () => {
    expect(page).toContain('<html lang="en" data-motion="standard" data-motion-preset="standard">');
    expect(page).toMatch(/<script src="\/assets\/motion-boot\.js\?v=[0-9a-f]+"><\/script>/);
    expect(page).toMatch(/<script src="\/assets\/vendor\/gsap\.min\.js\?v=[0-9a-f]+" defer><\/script>/);
    expect(page).toContain('min read');
    expect(page).toContain('<div class="progress" aria-hidden="true">');
    const calm = buildSite(snapshot([other]), { ...config, motion: 'calm' }, [asset]);
    expect(file(calm, '/index.html')).toContain('data-motion="calm" data-motion-preset="calm"');
    const bogus = buildSite(snapshot([other]), { ...config, motion: 'wild' as never }, [asset]);
    expect(file(bogus, '/index.html')).toContain('data-motion="standard"');
  });

  it('keeps media out of standing-page slugs', () => {
    expect(() =>
      buildSite(
        snapshot([]),
        config,
        [asset],
        [{ slug: 'media', title: 'M', description: 'D', bodyMarkdown: 'x', order: 1 }],
      ),
    ).toThrow(/unsafe page slug/);
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

describe('asset caching (v0.7.1)', () => {
  // /assets is cached for a year as immutable: the asset build versions every file the stylesheet
  // loads, and the preload must use the same address or the browser fetches the font twice.
  it('preloads the masthead font at the exact, versioned address the stylesheet loads', () => {
    const css = {
      path: '/assets/site.css',
      body: Buffer.from(
        "@font-face{src:url('fonts/fraunces-latin-full-normal.woff2?v=0123456789') format('woff2')}",
      ),
      contentType: 'text/css; charset=utf-8',
    };
    const home = file(buildSite(snapshot([]), config, [css]), '/index.html')!;
    expect(home).toContain(
      '<link rel="preload" href="/assets/fonts/fraunces-latin-full-normal.woff2?v=0123456789" as="font"',
    );
    // A stylesheet that does not load the font gets no preload for it.
    expect(file(buildSite(snapshot([]), config, [asset]), '/index.html')).not.toContain('rel="preload"');
  });
});
