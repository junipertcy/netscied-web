// Tasks 5.2, 5.4, 9.2 — pages built from fixture catalogs (angular.json
// configurations "fixture" and "fixture-empty"). Each build takes a few seconds.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';
import { parse, stringify } from 'yaml';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const ng = path.join(repoRoot, 'node_modules', '.bin', 'ng');

function buildSite(catalogRoot, siteDir, configuration) {
  const node = process.execPath;
  execFileSync(node, [path.join(repoRoot, 'scripts', 'catalog', 'build.mjs'), '--root', catalogRoot, '--out', path.join(repoRoot, siteDir), '--today', '2026-11-04', '--no-git'], { cwd: repoRoot, stdio: 'pipe' });
  execFileSync(ng, ['build', '--configuration', `production,${configuration}`], { cwd: repoRoot, stdio: 'pipe', env: { ...process.env, NG_CLI_ANALYTICS: 'false' } });
}

let full;
let empty;
before(() => {
  // The base fixture, plus a renamed id so the alias redirect page is built too.
  full = mkdtempSync(path.join(tmpdir(), 'cat-'));
  cpSync(path.join(repoRoot, 'tests', 'fixtures', 'catalog-base'), full, { recursive: true });
  const f = path.join(full, 'catalog', 'datasets', 'link-only-graph.yaml');
  writeFileSync(f, stringify({ ...parse(readFileSync(f, 'utf8')), aliases: ['old-link-graph'] }));
  writeFileSync(path.join(full, 'catalog', 'ids.lock'), readFileSync(path.join(full, 'catalog', 'ids.lock'), 'utf8') + 'dataset old-link-graph 2026-11-02\n');
  buildSite(full, 'build/fixture-site', 'fixture');
  buildSite(path.join(repoRoot, 'tests', 'fixtures', 'catalog-empty'), 'build/fixture-empty-site', 'fixture-empty');
  empty = true;
});

after(() => rmSync(full, { recursive: true, force: true }));

const page = (dist, rel) => parseHTML(readFileSync(path.join(repoRoot, dist, 'browser', rel), 'utf8')).document;
const text = (el) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const jsonld = (doc) => [...doc.querySelectorAll('script[type="application/ld+json"]')].map((s) => JSON.parse(s.textContent));

test('task 5.2: with an empty catalog the home page builds, says 0, links the wanted list and shows no example queries', () => {
  assert.ok(empty);
  const doc = page('dist/fixture-empty', 'index.html');
  assert.match(text(doc.querySelector('.count-line')), /目前收錄 0 筆資料集/);
  assert.ok(doc.querySelector('.count-line a[href="/wanted/"]'));
  assert.equal(doc.querySelectorAll('.examples a').length, 0);
  assert.equal(page('dist/fixture-empty', 'datasets/index.html').querySelectorAll('tbody tr').length, 0);
});

test('task 5.4: a withdrawn dataset renders its date and reason, with no downloads and no Dataset markup', () => {
  const doc = page('dist/fixture', 'datasets/withdrawn-thing/index.html');
  const main = text(doc.querySelector('main'));
  assert.match(main, /此資料集已於 2026 年 10 月 20 日 下架/);
  assert.match(main, /依當事人請求下架/);
  assert.equal(doc.querySelectorAll('main a[href*="/data/"]').length, 0);
  assert.ok(!jsonld(doc).some((j) => j['@type'] === 'Dataset'));
});

test('task 5.4: a renamed id renders a redirect to the current page', () => {
  const doc = page('dist/fixture', 'datasets/old-link-graph/index.html');
  assert.equal(doc.querySelector('meta[http-equiv="refresh"]').getAttribute('content'), '0; url=/datasets/link-only-graph/');
  assert.equal(doc.querySelector('link[rel="canonical"]').getAttribute('href'), 'https://netscied.tw/datasets/link-only-graph/');
  assert.match(doc.querySelector('meta[name="robots"]').getAttribute('content'), /noindex/);
});

// The properties Google's Dataset structured-data guide requires and recommends
// (https://developers.google.com/search/docs/appearance/structured-data/dataset).
function checkDatasetJsonLd(ds) {
  const problems = [];
  if (ds['@context'] !== 'https://schema.org' || ds['@type'] !== 'Dataset') problems.push('@context/@type');
  if (!ds.name) problems.push('name');
  if (typeof ds.description !== 'string' || ds.description.length < 50 || ds.description.length > 5000) problems.push('description 50–5000');
  for (const k of ['url', 'identifier', 'license', 'creator', 'isAccessibleForFree', 'includedInDataCatalog', 'keywords', 'spatialCoverage']) if (ds[k] === undefined) problems.push(k);
  for (const c of [ds.creator].flat()) if (!['Organization', 'Person'].includes(c?.['@type']) || !c.name) problems.push('creator type/name');
  for (const d of ds.distribution ?? []) if (d['@type'] !== 'DataDownload' || !d.contentUrl || !d.encodingFormat) problems.push('distribution');
  return problems;
}

test('task 5.4: the hosted and the link-only fixture carry complete Dataset JSON-LD', () => {
  const hosted = jsonld(page('dist/fixture', 'datasets/hosted-graph/index.html')).find((j) => j['@type'] === 'Dataset');
  assert.deepEqual(checkDatasetJsonLd(hosted), []);
  assert.equal(hosted.distribution.length, 1);
  assert.equal(hosted.version, '1.0.0');
  const link = jsonld(page('dist/fixture', 'datasets/link-only-graph/index.html')).find((j) => j['@type'] === 'Dataset');
  assert.deepEqual(checkDatasetJsonLd(link), []);
  assert.equal(link.distribution, undefined);
});

test('task 5.4: the hosted fixture shows its download table with checksums; the link-only one its access links', () => {
  const hosted = page('dist/fixture', 'datasets/hosted-graph/index.html');
  assert.ok(hosted.querySelector('main a[href="https://netscied.tw/data/hosted-graph/1.0.0/hosted-graph-1.0.0.graphml"]'));
  assert.match(text(hosted.querySelector('main')), /000000000000…/);
  const link = page('dist/fixture', 'datasets/link-only-graph/index.html');
  assert.ok(link.querySelector('main a[href="https://example.org/other/download"]'));
  assert.equal(link.querySelectorAll('main a[href*="/data/"]').length, 0);
});

test('task 9.2: a consenting person is credited on the dataset page with only the fields they agreed to', () => {
  const doc = page('dist/fixture', 'datasets/hosted-graph/index.html');
  const credits = [...doc.querySelectorAll('main section')].find((s) => text(s.querySelector('h2')) === '蒐集者與貢獻者');
  assert.match(text(credits), /測試研究者/);
  assert.match(text(credits), /測試大學/);
  // The record has an ORCID, but display lists only name and affiliation.
  assert.ok(!doc.body.innerHTML.includes('0000-0002-1825-0097'));
  const ds = jsonld(doc).find((j) => j['@type'] === 'Dataset');
  assert.ok(ds.creator.some((c) => c['@type'] === 'Person' && c.name === '測試研究者' && !c.sameAs));
});
