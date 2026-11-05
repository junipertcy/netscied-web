// Task 2.2 — robots.txt and sitemap.xml are part of the deployable build.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { distRoot, readDist } from '../helpers/dist.mjs';

test('robots.txt is in the build output', () => {
  assert.match(readDist('robots.txt'), /^Sitemap: https:\/\/netscied\.tw\/sitemap\.xml$/m);
});

test('sitemap.xml lists every prerendered page except /404/, each with a date', () => {
  const xml = readDist('sitemap.xml');
  const routes = Object.keys(JSON.parse(readFileSync(path.join(distRoot, 'prerendered-routes.json'), 'utf8')).routes);
  const expected = routes.filter((r) => r !== '/404' && r !== '/search');
  assert.equal(xml.match(/<url>/g)?.length, expected.length);
  for (const route of expected) {
    const loc = `https://netscied.tw${route === '/' ? '/' : `${route}/`}`;
    assert.match(xml, new RegExp(`<loc>${loc.replace(/[.]/g, '\\.')}</loc>\\s*<lastmod>\\d{4}-\\d{2}-\\d{2}</lastmod>`));
  }
  assert.doesNotMatch(xml, /\/404\//);
});
