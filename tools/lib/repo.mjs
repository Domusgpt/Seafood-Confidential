// Repository access helpers. Every tool takes a `repo` object so tests can point at a temporary tree.
import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** @param {string} [root] */
export function createRepo(root = REPO_ROOT) {
  const abs = (rel) => path.join(root, rel);
  return {
    root,
    abs,
    exists: (rel) => existsSync(abs(rel)),
    readText: (rel) => readFile(abs(rel), 'utf8'),
    readBytes: (rel) => readFile(abs(rel)),
    async readJson(rel) {
      const text = await readFile(abs(rel), 'utf8');
      try {
        return JSON.parse(text);
      } catch (err) {
        throw new Error(`${rel}: invalid JSON (${err.message})`);
      }
    },
    /** List files (relative paths) under a directory, recursively, skipping heavy/ignored folders. */
    async list(relDir = '.', { exts } = {}) {
      const out = [];
      const skip = new Set([
        'node_modules',
        '.git',
        '_site',
        '.cache',
        'test-results',
        'playwright-report',
        '.next',
        'out',
        '.turbo',
        'coverage',
        '.temp',
        '.branches',
      ]);
      async function walk(dir) {
        let entries;
        try {
          entries = await readdir(abs(dir), { withFileTypes: true });
        } catch {
          return;
        }
        for (const e of entries) {
          if (skip.has(e.name)) continue;
          const rel = path.posix.join(dir === '.' ? '' : dir, e.name);
          if (e.isDirectory()) await walk(rel);
          else if (!exts || exts.some((x) => e.name.toLowerCase().endsWith(x))) out.push(rel);
        }
      }
      await walk(relDir);
      return out.sort();
    },
    async mtime(rel) {
      return (await stat(abs(rel))).mtime;
    },
  };
}

/** Best-effort git metadata; falls back to environment variables used in CI. */
export function gitInfo(root = REPO_ROOT) {
  const run = (...args) => {
    try {
      return execFileSync('git', args, {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
    } catch {
      return '';
    }
  };
  const branch =
    process.env.HUB_BRANCH ||
    process.env.GITHUB_HEAD_REF ||
    process.env.GITHUB_REF_NAME ||
    run('rev-parse', '--abbrev-ref', 'HEAD') ||
    'unknown';
  const commit = process.env.HUB_COMMIT || process.env.GITHUB_SHA || run('rev-parse', 'HEAD') || '';
  return {
    branch,
    commit,
    shortCommit: commit ? commit.slice(0, 7) : 'uncommitted',
    dirty: run('status', '--porcelain') !== '',
    remote: 'https://github.com/Domusgpt/Seafood-Confidential',
  };
}
