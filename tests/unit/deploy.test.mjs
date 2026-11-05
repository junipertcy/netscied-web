// Task 2.4 — site-hosting spec: "Safe deploys", "Cache policy for pages and data",
// "Correct content types for machine files".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { classify, planDeploy, runDeploy } from '../../scripts/deploy.mjs';
import { repoRoot } from '../helpers/dist.mjs';

const IMMUTABLE = 'public, max-age=31536000, immutable';
const SHORT = 'public, max-age=300';

test('content-hashed build assets are cached for a year, immutable', () => {
  for (const f of ['main-XZNRWFHO.js', 'styles-PX6BAKAQ.css', 'chunk-ABCD1234.js', 'media/font-ABCD1234.woff2']) {
    assert.equal(classify(f).cacheControl, IMMUTABLE, f);
    assert.equal(classify(f).phase, 'hashed', f);
  }
});

test('pages and machine files get at most 5 minutes and the spec content types', () => {
  const expected = {
    'index.html': 'text/html; charset=utf-8',
    '404/index.html': 'text/html; charset=utf-8',
    'robots.txt': 'text/plain; charset=utf-8',
    'sitemap.xml': 'application/xml; charset=utf-8',
    'news/feed.xml': 'application/atom+xml; charset=utf-8',
    'api/v1/index.json': 'application/json; charset=utf-8',
    'datasets/x/index.md': 'text/markdown; charset=utf-8',
    'api/v1/datasets.csv': 'text/csv; charset=utf-8',
  };
  for (const [file, type] of Object.entries(expected)) {
    assert.equal(classify(file).contentType, type, file);
    assert.equal(classify(file).cacheControl, SHORT, file);
  }
});

test('files the deploy does not know how to cache are refused, not guessed', () => {
  for (const f of ['notes.txt', 'unhashed.js', 'other.xml']) {
    assert.throws(() => classify(f), /unclassified/, f);
  }
});

const files = [
  'index.html', '404/index.html', 'networks/index.html', 'main-XZNRWFHO.js', 'styles-PX6BAKAQ.css',
  'assets/img/cc-by-sa-small.png', 'robots.txt', 'sitemap.xml',
];
const plan = planDeploy({ buildDir: '/build', files, bucket: 'netscied.tw', distributionId: 'ETEST' });
const indexOf = (pred) => plan.findIndex(pred);
const lastIndexOf = (pred) => plan.length - 1 - [...plan].reverse().findIndex(pred);

test('hashed assets upload first, HTML uploads after everything else, invalidation is last', () => {
  const lastAsset = lastIndexOf((s) => s.phase === 'hashed');
  const firstOther = indexOf((s) => s.phase !== 'hashed');
  const firstHtml = indexOf((s) => s.phase === 'html');
  const lastNonHtmlUpload = lastIndexOf((s) => s.phase !== 'html' && s.phase !== 'invalidate');
  assert.ok(lastAsset < firstOther);
  assert.ok(lastNonHtmlUpload < firstHtml);
  assert.equal(plan.at(-1).phase, 'invalidate');
  assert.equal(plan.filter((s) => s.phase === 'invalidate').length, 1);
  assert.deepEqual(plan.at(-1).args, ['cloudfront', 'create-invalidation', '--distribution-id', 'ETEST', '--paths', '/*']);
});

test('the deploy never deletes, so the previous deploy keeps working', () => {
  for (const step of plan) assert.ok(!step.args.includes('--delete'), step.label);
});

test('every file is uploaded exactly once, with its cache and content type', () => {
  const uploaded = plan.flatMap((s) => s.files ?? []);
  assert.deepEqual([...uploaded].sort(), [...files].sort());
  const robots = plan.find((s) => s.files?.includes('robots.txt'));
  assert.ok(robots.args.includes('text/plain; charset=utf-8'));
  assert.ok(robots.args.includes(SHORT));
  assert.equal(robots.files.length, 1);
});

test('a failing step stops the deploy before anything after it runs', async () => {
  const ran = [];
  const failAt = indexOf((s) => s.phase === 'html');
  await assert.rejects(
    runDeploy(plan, async (args, step) => {
      ran.push(step.label);
      if (ran.length - 1 === failAt) throw new Error('network down');
    }),
    /network down/,
  );
  assert.equal(ran.length, failAt + 1);
  assert.ok(!ran.some((label) => label.startsWith('invalidate')));
});

test('--dry-run on the real build prints the plan and calls no AWS command', () => {
  const out = execFileSync(process.execPath, [path.join(repoRoot, 'scripts', 'deploy.mjs'), '--dry-run'], {
    cwd: repoRoot,
    env: { PATH: '', NETSCIED_CF_DISTRIBUTION_ID: 'ETEST' },
    encoding: 'utf8',
  });
  const lines = out.trim().split('\n').filter((l) => l.startsWith('aws '));
  assert.ok(lines.length >= 3, out);
  assert.match(lines[0], /max-age=31536000, immutable/);
  assert.match(out, /--include main-[A-Z0-9]{8}\.js/);
  assert.match(lines.at(-1), /^aws cloudfront create-invalidation --distribution-id ETEST --paths '\/\*'$/);
});

// Task 11.4 — Angular's client-side-rendering fallback page is not part of the
// static site; uploading it would publish a second, unrendered copy of the home page.
test('index.csr.html is never uploaded', () => {
  const p = planDeploy({ buildDir: '/b', files: ['index.html', 'index.csr.html', 'main-ABCDEFGH.js'], bucket: 'b', distributionId: 'E' });
  const uploaded = p.flatMap((s) => s.files ?? []);
  assert.ok(!uploaded.includes('index.csr.html'));
  assert.ok(uploaded.includes('index.html'));
  assert.ok(!p.some((s) => s.args.includes('index.csr.html')));
});
