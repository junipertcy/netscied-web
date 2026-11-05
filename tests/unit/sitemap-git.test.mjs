// Review finding (important): in a shallow clone, git dates every page with HEAD's
// date, so each deploy would re-date the whole sitemap. Page dates must come from
// full history, and the build must refuse to guess.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gitLastmod } from '../../scripts/build/sitemap.mjs';

function git(cwd, args, date) {
  const env = { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date };
  return execFileSync('git', args, { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function commitFile(repo, file, date) {
  mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
  writeFileSync(path.join(repo, file), date);
  git(repo, ['add', file], date);
  git(repo, ['-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '-m', file], date);
}

const scratch = mkdtempSync(path.join(tmpdir(), 'netscied-sitemap-'));
const repo = path.join(scratch, 'repo');
mkdirSync(repo);
git(repo, ['init', '-q']);
commitFile(repo, 'src/app/pages/a/page.html', '2025-01-15T12:00:00Z');
commitFile(repo, 'src/app/pages/b/page.html', '2025-06-01T12:00:00Z');

test.after(() => rmSync(scratch, { recursive: true, force: true }));

test('a page is dated by the last commit that touched it, not by HEAD', () => {
  assert.equal(gitLastmod(repo, ['src/app/pages/a']), '2025-01-15');
  assert.equal(gitLastmod(repo, ['src/app/pages/b']), '2025-06-01');
});

test('a shallow clone is refused, with the fix in the message', () => {
  const shallow = path.join(scratch, 'shallow');
  execFileSync('git', ['clone', '-q', '--depth', '1', `file://${repo}`, shallow]);
  assert.throws(() => gitLastmod(shallow, ['src/app/pages/a']), /shallow.*fetch-depth: 0/s);
});

test('a directory outside git is refused with a clear message', () => {
  const plain = path.join(scratch, 'plain');
  mkdirSync(plain);
  assert.throws(() => gitLastmod(plain, ['src/app/pages/a']), /needs git history/);
});
