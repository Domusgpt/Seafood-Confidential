// Slugs shared by the dev log, the hub build and the Pages workflow. Dependency-free on purpose:
// the workflow calls `node tools/lib/slug.mjs <branch>` before dependencies are installed.
export const slugify = (s) =>
  String(s)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);

/** "claude/intelligent-cannon-d1nqq6" → "claude-intelligent-cannon-d1nqq6" */
export const branchSlug = (branch) => slugify(String(branch).replace(/\//g, '-')) || 'branch';

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!process.argv[2]) {
    console.error('usage: node tools/lib/slug.mjs <branch-name>');
    process.exitCode = 2;
  } else console.log(branchSlug(process.argv[2]));
}
