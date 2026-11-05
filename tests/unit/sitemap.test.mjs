// Task 2.2 — agent-access spec, "Crawl policy and sitemap".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSitemap, redirectSources, sourcesForRoute } from '../../scripts/build/sitemap.mjs';

const ORIGIN = 'https://netscied.tw';
const fixedDate = () => '2026-11-04';

test('every page URL is absolute and ends with a trailing slash', () => {
  const xml = buildSitemap({ routes: ['/', '/networks', '/stat1021'], origin: ORIGIN, lastmod: fixedDate });
  assert.match(xml, /<loc>https:\/\/netscied\.tw\/<\/loc>/);
  assert.match(xml, /<loc>https:\/\/netscied\.tw\/networks\/<\/loc>/);
  assert.match(xml, /<loc>https:\/\/netscied\.tw\/stat1021\/<\/loc>/);
  assert.doesNotMatch(xml, /<loc>https:\/\/netscied\.tw\/networks<\/loc>/);
});

test('the not-found page and the search page are excluded', () => {
  const xml = buildSitemap({ routes: ['/', '/404', '/search', '/networks'], origin: ORIGIN, lastmod: fixedDate });
  assert.doesNotMatch(xml, /\/404\//);
  assert.doesNotMatch(xml, /\/search\//);
  assert.equal(xml.match(/<url>/g).length, 2);
});

test('each entry carries the lastmod reported for its route', () => {
  const dates = { '/': '2026-01-02', '/networks': '2025-12-31' };
  const xml = buildSitemap({ routes: ['/', '/networks'], origin: ORIGIN, lastmod: (r) => dates[r] });
  assert.match(xml, /<loc>https:\/\/netscied\.tw\/<\/loc>\s*<lastmod>2026-01-02<\/lastmod>/);
  assert.match(xml, /<loc>https:\/\/netscied\.tw\/networks\/<\/loc>\s*<lastmod>2025-12-31<\/lastmod>/);
});

test('output is a sitemaps.org urlset, sorted, so rebuilds are byte-identical', () => {
  const a = buildSitemap({ routes: ['/refs', '/', '/networks'], origin: ORIGIN, lastmod: fixedDate });
  const b = buildSitemap({ routes: ['/networks', '/refs', '/'], origin: ORIGIN, lastmod: fixedDate });
  assert.equal(a, b);
  assert.match(a, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  assert.ok(a.indexOf('/networks/') < a.indexOf('/refs/'));
});

test('XML special characters in a URL are escaped', () => {
  const xml = buildSitemap({ routes: ['/a&b'], origin: ORIGIN, lastmod: fixedDate });
  assert.match(xml, /<loc>https:\/\/netscied\.tw\/a&amp;b\/<\/loc>/);
});

test('a page is dated by the sources it is built from (task 7.1: records date their own pages)', () => {
  assert.deepEqual(sourcesForRoute('/'), ['src/app/pages/home', 'content/news', 'catalog/datasets', 'catalog/courses']);
  assert.deepEqual(sourcesForRoute('/datasets/golden-horse-2018-nominations'), ['catalog/datasets/golden-horse-2018-nominations.yaml', 'catalog/versions/golden-horse-2018-nominations']);
  assert.deepEqual(sourcesForRoute('/courses/nthu-network-science'), ['catalog/courses/nthu-network-science.yaml']);
  assert.deepEqual(sourcesForRoute('/datasets'), ['src/app/pages/datasets', 'catalog/datasets', 'catalog/versions']);
  assert.deepEqual(sourcesForRoute('/courses'), ['src/app/pages/courses', 'catalog/courses', 'catalog/international.yaml']);
  assert.deepEqual(sourcesForRoute('/wanted'), ['src/app/pages/wanted', 'catalog/datasets']);
  assert.deepEqual(sourcesForRoute('/news'), ['src/app/pages/news', 'content/news']);
  assert.deepEqual(sourcesForRoute('/about'), ['src/app/pages/about']);
  assert.deepEqual(sourcesForRoute('/stat1021'), ['src/app/pages/stat1021']);
});

// Task 11.2 — Angular prerenders redirectTo routes (meta-refresh pages) and lists
// them in prerendered-routes.json; a redirect source is not a page to index.
test('redirect sources are excluded', () => {
  const xml = buildSitemap({ routes: ['/', '/networks', '/datasets', '/datasets/old-id'], origin: ORIGIN, lastmod: fixedDate, exclude: ['/networks', '/datasets/old-id'] });
  assert.doesNotMatch(xml, /\/networks\//);
  assert.doesNotMatch(xml, /old-id/);
  assert.match(xml, /<loc>https:\/\/netscied\.tw\/datasets\/<\/loc>/);
});

test('the redirect sources come from the enabled rows of config/redirects.yaml and from dataset aliases', () => {
  const redirects = 'canonical_host: netscied.tw\npaths:\n  - { from: /networks, to: /datasets/, enabled: true }\n  - { from: /refs, to: /courses/, enabled: false }\n';
  const routesData = { dataset_aliases: [{ from: 'old-id', to: 'new-id' }] };
  assert.deepEqual(redirectSources(redirects, routesData).sort(), ['/datasets/old-id', '/networks']);
});
