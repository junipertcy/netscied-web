// Task 6.5 — the gold-set gate. It runs the same search core as the browser over
// the built catalog.json, and fails on a missing expected record, a forbidden
// record in the top five, an unexpected result count, or a script variant
// (Simplified, 臺/台, full-width) that changes the top result.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stringify } from 'yaml';
import { evaluateGold, variants } from '../../scripts/search-eval.mjs';
import { makeNormalizeData } from '../../scripts/search/normalize-data.mjs';
import { readYaml } from '../../scripts/catalog/lib/yaml.mjs';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const concepts = readYaml(path.join(repoRoot, 'catalog', 'vocab', 'concepts.yaml')).data;

const rec = (over) => ({ type: 'dataset', status: 'published', url: '', keywords: [], aliases: [], description: '', en: '', internet: false, domains: [], kinds: ['graph'], display: {}, ...over });
const records = [
  rec({ id: 'metro', title: { zh: '臺北捷運起訖站旅次', en: 'Taipei MRT trips' }, aliases: ['捷運', 'mrt', '地鐵'] }),
  rec({ id: 'film', title: { zh: '金馬獎入圍者網絡', en: 'Golden Horse nominees' }, aliases: ['電影', '金馬獎', 'bipartite'] }),
  rec({ id: 'twnic', title: { zh: 'TWNIC 連線頻寬網絡', en: 'TWNIC bandwidth' }, aliases: ['網際網路', 'internet'], internet: true }),
];
const catalog = { schema: 1, normalize: makeNormalizeData(concepts, records.flatMap((r) => [r.title.zh, r.title.en, ...r.aliases])), records };

test('variants: Simplified, 臺/台 swap and full-width forms of a Traditional query', () => {
  const v = variants('臺北捷運 MRT');
  assert.equal(v.simplified, '台北捷运 MRT');
  assert.equal(v.swapped, '台北捷運 MRT');
  assert.equal(v.fullwidth, '臺北捷運　ＭＲＴ');
});

test('a passing gold set passes, with invariance checks on Traditional queries', () => {
  const r = evaluateGold(catalog, [
    { q: '臺北捷運', mode: 'datasets', lang: 'zh-Hant', expected: ['metro'], first: 'metro' },
    { q: 'internet', mode: 'datasets', lang: 'en', expected: ['twnic'], forbidden: ['film'] },
  ]);
  assert.deepEqual(r.failures, []);
  assert.equal(r.checked, 2);
  // A query of Han characters only has no separate full-width form: two variants.
  assert.equal(r.invariance, 2);
});

test('an injected forbidden result fails and names the query and the record', () => {
  const r = evaluateGold(catalog, [{ q: '金馬獎', mode: 'datasets', lang: 'zh-Hant', forbidden: ['film'] }]);
  assert.equal(r.failures.length, 1);
  assert.match(r.failures[0], /金馬獎/);
  assert.match(r.failures[0], /forbidden/);
  assert.match(r.failures[0], /film/);
});

test('a missing expected record fails', () => {
  const r = evaluateGold(catalog, [{ q: '金馬獎', mode: 'datasets', lang: 'zh-Hant', expected: ['metro'] }]);
  assert.match(r.failures[0], /expected metro in the top 5/);
});

test('an expected record that is not published (for example withdrawn) is skipped, not failed', () => {
  const r = evaluateGold(catalog, [{ q: '捷運', mode: 'datasets', lang: 'zh-Hant', expected: ['metro', 'withdrawn-thing'] }]);
  assert.deepEqual(r.failures, []);
  assert.deepEqual(r.skipped, ['捷運: withdrawn-thing (not published)']);
});

test('expect_zero and expect_nonzero are enforced', () => {
  const zero = evaluateGold(catalog, [{ q: '捷運', mode: 'datasets', lang: 'zh-Hant', expect_zero: true }]);
  assert.match(zero.failures[0], /expected no results/);
  const some = evaluateGold(catalog, [{ q: '量子糾纏', mode: 'datasets', lang: 'zh-Hant', expect_nonzero: true }]);
  assert.match(some.failures[0], /expected at least one result/);
});

test('a script variant that changes the top result fails', () => {
  // A record reachable only through a Traditional-only alias, so the fold map
  // cannot bring the Simplified form back: the invariance check must notice.
  const broken = structuredClone(catalog);
  broken.normalize.fold = {};
  const r = evaluateGold(broken, [{ q: '捷運', mode: 'datasets', lang: 'zh-Hant', expected: ['metro'] }]);
  assert.ok(r.failures.some((f) => /variant/.test(f)), r.failures.join('\n'));
});

test('the CLI exits non-zero on a failing gold set', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'gold-'));
  try {
    writeFileSync(path.join(dir, 'catalog.json'), JSON.stringify(catalog));
    writeFileSync(path.join(dir, 'gold.yaml'), stringify({ queries: [{ q: '金馬獎', mode: 'datasets', lang: 'zh-Hant', forbidden: ['film'] }] }));
    const res = spawnSync(process.execPath, [path.join(repoRoot, 'scripts', 'search-eval.mjs'), '--catalog', path.join(dir, 'catalog.json'), '--gold', path.join(dir, 'gold.yaml')], { encoding: 'utf8' });
    assert.notEqual(res.status, 0);
    assert.match(res.stdout + res.stderr, /forbidden/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the repository gold set has at least 20 queries spanning every required case', () => {
  const gold = readYaml(path.join(repoRoot, 'catalog', 'search-gold.yaml')).data.queries;
  assert.ok(gold.length >= 20, `${gold.length} queries`);
  const langs = new Set(gold.map((g) => g.lang));
  for (const l of ['zh-Hant', 'zh-Hans', 'en', 'mixed']) assert.ok(langs.has(l), l);
  assert.ok(gold.some((g) => g.expect_nonzero), 'a generic-only query');
  assert.ok(gold.some((g) => g.q.includes('計算機網路')), 'a computer-networking query');
  assert.ok(gold.some((g) => g.mode === 'courses'), 'course queries');
  for (const g of gold) assert.ok(g.first || g.expected?.length || g.forbidden?.length || g.expect_zero || g.expect_nonzero || g.expected_wanted?.length, `${g.q} asserts nothing`);
  void readFileSync;
});
