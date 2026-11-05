// Task 3.5 — scripts/catalog/build.mjs writes the generated catalog and the static
// JSON API into a build directory. Built here from tests/fixtures/catalog-base.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, mkdirSync, cpSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const fixture = path.join(repoRoot, 'tests', 'fixtures', 'catalog-base');
const snapshotDir = path.join(repoRoot, 'tests', 'fixtures', 'build-snapshot');
const cli = path.join(repoRoot, 'scripts', 'catalog', 'build.mjs');
let out;

function build(root, outDir, extra = []) {
  return spawnSync(process.execPath, [cli, '--root', root, '--out', outDir, '--today', '2026-11-04', '--no-git', ...extra], { encoding: 'utf8' });
}

before(() => {
  out = mkdtempSync(path.join(tmpdir(), 'site-'));
  const res = build(fixture, out);
  assert.equal(res.status, 0, res.stdout + res.stderr);
});

after(() => rmSync(out, { recursive: true, force: true }));

const json = (rel) => JSON.parse(readFileSync(path.join(out, rel), 'utf8'));
const files = (dir, prefix = '') =>
  readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? files(p, `${prefix}${f}/`) : [`${prefix}${f}`];
  });

test('api/v1/index.json lists every file under /api/v1/, with counts and the CC0 metadata license', () => {
  const index = json('api/v1/index.json');
  const listed = index.files.map((f) => f.path).sort();
  const actual = files(path.join(out, 'api', 'v1')).map((f) => `/api/v1/${f}`).filter((f) => f !== '/api/v1/index.json').sort();
  assert.deepEqual(listed, actual);
  assert.equal(index.metadata_license.id, 'CC0-1.0');
  assert.equal(index.api_version, '1');
  assert.match(index.last_breaking_change, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(index.counts, { datasets: 2, hosted: 1, wanted: 1, withdrawn: 1, courses: 1 });
  assert.equal(index.courses_refreshed, '2026-11-01');
});

test('datasets.json holds published records only, each with the fields agents need', () => {
  const list = json('api/v1/datasets.json');
  assert.deepEqual(list.map((d) => d.id).sort(), ['hosted-graph', 'link-only-graph']);
  for (const d of list) {
    for (const k of ['id', 'title', 'kinds', 'license', 'latest_version', 'api_url', 'url']) assert.ok(k in d, `${d.id}: ${k}`);
    assert.match(d.api_url, /^https:\/\/netscied\.tw\/api\/v1\/datasets\/[a-z0-9-]+\.json$/);
  }
  assert.equal(list.find((d) => d.id === 'link-only-graph').latest_version, null);
});

test('a hosted record lists every file with format, size and SHA-256, and a citation and attribution', () => {
  const r = json('api/v1/datasets/hosted-graph.json');
  assert.equal(r.url, 'https://netscied.tw/datasets/hosted-graph/');
  const v = r.latest_version;
  assert.equal(v.version, '1.0.0');
  assert.equal(v.files[0].sha256.length, 64);
  assert.match(v.files[0].url, /^https:\/\/netscied\.tw\/data\/hosted-graph\/1\.0\.0\//);
  assert.ok(r.citation.text.includes('1.0.0'));
  assert.match(r.citation.bibtex, /^@misc\{/);
  assert.ok(r.citation.text.includes('https://netscied.tw/datasets/hosted-graph/'));
  assert.ok(r.attribution.includes('測試機關 2026 測試資料 v1'));
  assert.equal(r.license.class, 'permissive');
  assert.equal(r.redistribution.may_redistribute, true);
  assert.deepEqual(r.size.nodes, 3);
  assert.equal('upstream_snapshot' in v, false);
});

test('only consented fields of a person appear in the credits', () => {
  const r = json('api/v1/datasets/hosted-graph.json');
  assert.deepEqual(r.credits, [{ role: 'collector', name: { 'zh-Hant': '測試研究者', en: 'Test Researcher' }, affiliation: { name: { 'zh-Hant': '測試大學' } } }]);
});

test('a link-only record gives upstream access links and no downloads', () => {
  const r = json('api/v1/datasets/link-only-graph.json');
  assert.equal(r.latest_version, null);
  assert.deepEqual(r.versions, []);
  assert.equal(r.access[0].url, 'https://example.org/other/download');
  assert.equal(r.redistribution.may_redistribute, false);
  assert.equal(r.size.approximate, true);
});

test('a withdrawn record stays at its URL as a tombstone with no downloads', () => {
  const r = json('api/v1/datasets/withdrawn-thing.json');
  assert.equal(r.status, 'withdrawn');
  assert.equal(r.withdrawn.date, '2026-10-20');
  assert.ok(r.withdrawn.reason['zh-Hant']);
  assert.equal(JSON.stringify(r).includes('/data/'), false);
});

test('a suspended version lists no download URLs or checksums', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'cat-'));
  const outDir = mkdtempSync(path.join(tmpdir(), 'site-'));
  try {
    cpSync(fixture, dir, { recursive: true });
    const p = path.join(dir, 'catalog', 'versions', 'hosted-graph', '1.0.0.json');
    const m = JSON.parse(readFileSync(p, 'utf8'));
    m.suspended = true;
    writeFileSync(p, JSON.stringify(m));
    const res = build(dir, outDir);
    assert.equal(res.status, 0, res.stderr);
    const r = JSON.parse(readFileSync(path.join(outDir, 'api', 'v1', 'datasets', 'hosted-graph.json'), 'utf8'));
    assert.equal(r.versions[0].suspended, true);
    assert.deepEqual(r.versions[0].files, []);
    assert.equal(JSON.stringify(r).includes('sha256'), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(outDir, { recursive: true, force: true });
  }
});

test('wanted.json lists wanted records with status, and they stay out of datasets.json', () => {
  const w = json('api/v1/wanted.json');
  assert.deepEqual(w.map((x) => [x.id, x.status, x.requests]), [['wanted-thing', 'seeking', 2]]);
  assert.equal(w[0].url, 'https://netscied.tw/wanted/#wanted-thing');
});

test('courses.json gives the latest term in both forms and a freshness label', () => {
  const [c] = json('api/v1/courses.json');
  assert.equal(c.latest.term, '114-1');
  assert.equal(c.latest.term_label, '114-1（2025 秋）');
  assert.equal(c.freshness.id, 'recent');
  assert.equal(c.freshness['zh-Hant'], '最近開課：114-1');
  assert.equal(c.university.ror, 'https://ror.org/05bqach95');
});

test('CSV files are UTF-8 without a byte-order mark and have a header row', () => {
  for (const f of ['api/v1/datasets.csv', 'api/v1/courses.csv']) {
    const buf = readFileSync(path.join(out, f));
    assert.notDeepEqual([...buf.subarray(0, 3)], [0xef, 0xbb, 0xbf], f);
    assert.match(buf.toString('utf8').split('\n')[0], /^id,/);
  }
});

test('taxonomy.json carries every controlled vocabulary with Mandarin and English labels', () => {
  const t = json('api/v1/taxonomy.json');
  for (const k of ['domains', 'tags', 'kinds', 'licenses', 'formats', 'personal_data', 'redistribution', 'course_categories', 'levels', 'universities', 'concepts']) assert.ok(t[k], k);
  assert.equal(t.domains.length, 9);
  assert.equal(t.kinds.find((k) => k.id === 'hypergraph')['zh-Hant'], '超圖');
});

test('the response schemas are published under /api/v1/schema/, the source-record schemas under /api/v1/schema/source/', () => {
  for (const name of ['dataset-record', 'dataset-summary', 'course-record', 'course-summary', 'wanted-entry', 'news-item', 'index', 'api-common']) {
    assert.ok(existsSync(path.join(out, 'api', 'v1', 'schema', `${name}.schema.json`)), name);
  }
  for (const name of ['dataset', 'version', 'course', 'person', 'news', 'recipe', 'common', 'vocab']) {
    assert.ok(existsSync(path.join(out, 'api', 'v1', 'schema', 'source', `${name}.schema.json`)), name);
  }
});

test('catalog.json is the search payload: published datasets, wanted entries and courses, under budget', () => {
  const c = json('api/v1/catalog.json');
  const keys = c.records.map((r) => `${r.type}:${r.id}`).sort();
  assert.deepEqual(keys, ['course:test-graph-theory', 'dataset:hosted-graph', 'dataset:link-only-graph', 'wanted:wanted-thing']);
  assert.ok(c.normalize.fold['臺'] === undefined || c.normalize.fold['臺'] === '台');
  const gz = gzipSync(readFileSync(path.join(out, 'api', 'v1', 'catalog.json'))).length;
  assert.ok(gz < 150 * 1024);
});

test('news.json is newest first with permanent anchors', () => {
  const n = json('api/v1/news.json');
  assert.equal(n[0].id, '2026-11-04-relaunch');
  assert.equal(n[0].url, 'https://netscied.tw/news/#2026-11-04-relaunch');
  assert.match(n[0].body_html, /<p>/);
});

test('the build refuses an invalid catalog', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'cat-'));
  const outDir = mkdtempSync(path.join(tmpdir(), 'site-'));
  try {
    cpSync(fixture, dir, { recursive: true });
    writeFileSync(path.join(dir, 'catalog', 'datasets', 'hosted-graph.yaml'), 'id: hosted-graph\nstatus: published\n');
    const res = build(dir, outDir);
    assert.notEqual(res.status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(outDir, { recursive: true, force: true });
  }
});

test('the build output matches the committed snapshot (refresh with UPDATE_SNAPSHOTS=1 after review)', () => {
  const want = files(snapshotDir).sort();
  const got = files(path.join(out, 'api', 'v1'))
    .filter((f) => !f.startsWith('schema/'))
    .map((f) => `api/v1/${f}`)
    .concat(files(path.join(out, '_data')).map((f) => `_data/${f}`))
    .sort();
  assert.deepEqual(got, want, 'the set of generated files changed');
  for (const f of want) {
    assert.equal(readFileSync(path.join(out, f), 'utf8'), readFileSync(path.join(snapshotDir, f), 'utf8'), f);
  }
});

if (process.env.UPDATE_SNAPSHOTS === '1') {
  test('update snapshots', () => {
    rmSync(snapshotDir, { recursive: true, force: true });
    mkdirSync(snapshotDir, { recursive: true });
    for (const f of files(path.join(out, 'api', 'v1')).filter((x) => !x.startsWith('schema/'))) {
      mkdirSync(path.dirname(path.join(snapshotDir, 'api', 'v1', f)), { recursive: true });
      cpSync(path.join(out, 'api', 'v1', f), path.join(snapshotDir, 'api', 'v1', f));
    }
    cpSync(path.join(out, '_data'), path.join(snapshotDir, '_data'), { recursive: true });
  });
}

test('task 6.2: a search payload over 150 KB gzipped fails the build with the budget message', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'cat-'));
  const outDir = mkdtempSync(path.join(tmpdir(), 'site-'));
  try {
    cpSync(fixture, dir, { recursive: true });
    // Enough wanted records with incompressible Mandarin text to blow the budget.
    let seed = 7;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    const text = (n) => Array.from({ length: n }, () => String.fromCodePoint(0x4e00 + Math.floor(rand() * 20000))).join('');
    let lock = readFileSync(path.join(dir, 'catalog', 'ids.lock'), 'utf8');
    for (let i = 0; i < 700; i++) {
      const id = `bulk-${i}`;
      writeFileSync(
        path.join(dir, 'catalog', 'datasets', `${id}.yaml`),
        `id: ${id}\nstatus: wanted\nadded: 2026-11-01\ntitle: { zh-Hant: ${text(12)} }\ndescription: { zh-Hant: ${text(400)} }\ndomains: [society]\nwanted: { reason: { zh-Hant: 測試 } }\n`,
      );
      lock += `dataset ${id} 2026-11-01\n`;
    }
    writeFileSync(path.join(dir, 'catalog', 'ids.lock'), lock);
    const res = build(dir, outDir);
    assert.notEqual(res.status, 0, 'expected the build to fail');
    assert.match(res.stderr, /search payload budget exceeded/);
    assert.match(res.stderr, /150 KB/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(outDir, { recursive: true, force: true });
  }
});
