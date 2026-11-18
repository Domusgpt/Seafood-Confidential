// Renders repository Markdown into hub pages, rewriting relative links so they work inside the hub.
import path from 'node:path';
import { Marked } from 'marked';
import { escapeHtml, headingSlug } from './html.mjs';

/** Documents published in the hub, grouped for navigation. ADRs are appended dynamically. */
export const DOC_GROUPS = [
  {
    title: 'Start here',
    docs: [
      { src: 'README.md', slug: 'readme', title: 'Repository README' },
      { src: 'AGENTS.md', slug: 'agents', title: 'AGENTS.md: shared rules' },
      { src: 'CLAUDE.md', slug: 'claude', title: 'CLAUDE.md' },
      { src: 'docs/DEVELOPMENT_KIT.md', slug: 'development-kit', title: 'Development kit README' },
      { src: 'CONTRIBUTING.md', slug: 'contributing', title: 'Contributing' },
    ],
  },
  {
    title: 'Planning and status',
    docs: [
      {
        src: 'docs/planning/FOUNDATION_PLANNING_BRIEF.md',
        slug: 'foundation-planning-brief',
        title: 'Foundation planning brief',
      },
      { src: 'docs/IMPLEMENTATION_STATUS.md', slug: 'implementation-status', title: 'Implementation status' },
      { src: 'docs/KIT_AUDIT.md', slug: 'kit-audit', title: 'Kit audit' },
      { src: 'docs/SPRINT_PLAN.md', slug: 'sprint-plan', title: 'Sprint plan' },
      { src: 'planning/WORKBOOK.md', slug: 'workbook', title: 'Using the sprint workbook' },
    ],
  },
  {
    title: 'Product and architecture',
    docs: [
      { src: 'docs/PRODUCT_SPEC.md', slug: 'product-spec', title: 'Product specification' },
      { src: 'docs/ARCHITECTURE.md', slug: 'architecture', title: 'Architecture' },
      { src: 'docs/DESK.md', slug: 'desk', title: 'Operations desk' },
      { src: 'docs/DEPLOYMENT.md', slug: 'deployment', title: 'Deploying the desk and the public site' },
      {
        src: 'docs/planning/HOSTING_AND_COSTS.md',
        slug: 'hosting-and-costs',
        title: 'Hosting and running costs',
      },
      { src: 'apps/agent-lab/README.md', slug: 'agent-lab', title: 'Agent lab (Claude against the gateway)' },
      { src: 'docs/ACCEPTANCE_TESTS.md', slug: 'acceptance-tests', title: 'Acceptance tests' },
      { src: 'docs/RUNBOOK.md', slug: 'runbook', title: 'Runbook' },
      { src: 'contracts/README.md', slug: 'agent-contract', title: 'Agent request contract' },
      { src: 'docs/LAUNCH_PACKET.md', slug: 'launch-packet', title: 'Launch packet (full text)' },
    ],
  },
  { title: 'Decisions', docs: [] },
  {
    title: 'Editorial',
    docs: [
      { src: 'editorial/BRAND_GUIDE.md', slug: 'brand-guide', title: 'Brand guide' },
      { src: 'editorial/EDITORIAL_PLAYBOOK.md', slug: 'editorial-playbook', title: 'Editorial playbook' },
      {
        src: 'editorial/templates/ARTICLE_BRIEF.md',
        slug: 'template-article-brief',
        title: 'Template: article brief',
      },
      {
        src: 'editorial/templates/GUEST_CONTRIBUTOR.md',
        slug: 'template-guest-contributor',
        title: 'Template: guest contributor',
      },
      {
        src: 'editorial/templates/INTERVIEW_RUN_OF_SHOW.md',
        slug: 'template-interview',
        title: 'Template: interview run of show',
      },
      {
        src: 'editorial/templates/SOCIAL_RELEASE_CHECKLIST.md',
        slug: 'template-social-release',
        title: 'Template: social release checklist',
      },
      {
        src: 'editorial/templates/SOURCE_RECORD.md',
        slug: 'template-source-record',
        title: 'Template: source record',
      },
    ],
  },
  {
    title: 'Engineering',
    docs: [
      {
        src: 'docs/DEVELOPMENT_ENVIRONMENT.md',
        slug: 'development-environment',
        title: 'Development environment',
      },
      { src: 'docs/PROJECT_HUB.md', slug: 'project-hub', title: 'Project hub and previews' },
      { src: 'devtrack/README.md', slug: 'devtrack', title: 'Delivery tracking' },
      { src: 'devlog/README.md', slug: 'devlog-guide', title: 'Dev log guide' },
      { src: 'brand/README.md', slug: 'visual-codex-source', title: 'Visual codex sources' },
      { src: 'SECURITY.md', slug: 'security', title: 'Security policy' },
      { src: 'THIRD_PARTY_NOTICES.md', slug: 'third-party-notices', title: 'Third-party notices' },
      { src: 'CHANGELOG.md', slug: 'changelog', title: 'Changelog' },
      { src: 'packet/README.md', slug: 'packet', title: 'Founder packet originals' },
    ],
  },
];

/** Repository folders copied into the site as-is (served locally; the CSP allows only same-origin images). */
export const SITE_COPIED = ['devlog/assets/'];

/** Asset substitutions: heavy originals are replaced by web derivatives inside the hub. */
const ASSET_MAP = {
  'brand/Seafood_Confidential_Brand_Concept.png': 'assets/brand-concept-1536.jpg',
};

export function buildDocIndex(adrs) {
  const groups = DOC_GROUPS.map((g) => ({ ...g, docs: [...g.docs] }));
  const decisions = groups.find((g) => g.title === 'Decisions');
  for (const a of adrs) {
    const n = /ADR-(\d+)/.exec(a.file)?.[1] ?? a.file;
    decisions.docs.push({
      src: a.file,
      slug: `adr-${n}`,
      title: a.title.replace(/^ADR\s*0*(\d+)\s*/i, `ADR-${n.padStart(3, '0')} `),
    });
  }
  const bySrc = new Map();
  for (const g of groups) for (const d of g.docs) bySrc.set(d.src, d);
  return { groups, bySrc };
}

/**
 * @param {string} markdown
 * @param {object} ctx { src, bySrc, githubBlob(path), rel (prefix from docs/ page to site root) }
 */
export function renderMarkdown(markdown, ctx) {
  const marked = new Marked({ gfm: true });
  const usedIds = new Map();
  const rewrite = (href, { image = false } = {}) => {
    if (!href || /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('#')) return href;
    const [rawPath, hash] = href.split('#');
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(ctx.src), decodeURI(rawPath)));
    if (ASSET_MAP[resolved]) return `${ctx.rel}${ASSET_MAP[resolved]}`;
    if (SITE_COPIED.some((prefix) => resolved.startsWith(prefix))) return `${ctx.rel}${resolved}`;
    const doc = ctx.bySrc.get(resolved) ?? ctx.bySrc.get(path.posix.join(resolved, 'README.md'));
    if (doc && !image) return `${ctx.docBase ?? ''}${doc.slug}.html${hash ? `#${hash}` : ''}`;
    return ctx.githubBlob(resolved) + (hash ? `#${hash}` : '');
  };
  marked.use({
    walkTokens(token) {
      if (token.type === 'link') token.href = rewrite(token.href);
      if (token.type === 'image') token.href = rewrite(token.href, { image: true });
    },
    renderer: {
      heading({ tokens, depth }) {
        const html = this.parser.parseInline(tokens);
        const level = Math.min(6, depth + (ctx.demote ?? 0));
        let id = headingSlug(html);
        const n = usedIds.get(id) ?? 0;
        usedIds.set(id, n + 1);
        if (n) id = `${id}-${n}`;
        return `<h${level} id="${id}">${html}</h${level}>\n`;
      },
      image({ href, title, text }) {
        return `<img src="${escapeHtml(href)}" alt="${escapeHtml(text)}"${title ? ` title="${escapeHtml(title)}"` : ''} loading="lazy" decoding="async">`;
      },
    },
  });
  // Wide tables and code blocks scroll horizontally on phones: make them focusable, named regions
  // so keyboard users can scroll them (WCAG 2.1.1; axe scrollable-region-focusable).
  return marked
    .parse(markdown)
    .replace(
      /<table>/g,
      '<div class="table-wrap" tabindex="0" role="region" aria-label="Scrollable table"><table>',
    )
    .replace(/<\/table>/g, '</table></div>')
    .replace(/<pre>/g, '<pre tabindex="0" role="region" aria-label="Code block">');
}

/** Number of level-one ATX headings outside fenced code (documents with several are demoted). */
export const countH1 = (markdown) =>
  (markdown.replace(/```[\s\S]*?```/g, '').match(/^#\s+\S/gm) ?? []).length;
