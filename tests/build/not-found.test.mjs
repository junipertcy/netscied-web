// Task 2.1 — site-structure spec, "Real not-found responses".
// CloudFront maps 403/404 to /404/index.html with status 404 (task 2.5), so the
// build must prerender a concrete 404 page that search engines will not index.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { distPath, distRoot } from '../helpers/dist.mjs';

test('the build prerenders /404/ to 404/index.html', () => {
  assert.ok(existsSync(distPath('404/index.html')), 'dist/netscied/browser/404/index.html is missing');
  const manifest = JSON.parse(readFileSync(path.join(distRoot, 'prerendered-routes.json'), 'utf8'));
  assert.ok('/404' in manifest.routes, 'prerendered-routes.json does not list /404');
});

test('the 404 page tells search engines not to index it', () => {
  const html = distPath('404/index.html');
  assert.match(readFileSync(html, 'utf8'), /<meta name="robots" content="noindex">/);
});

test('the 404 page is in Mandarin, has the search form, and links to the datasets and courses (Phase 1)', () => {
  const html = readFileSync(distPath('404/index.html'), 'utf8');
  assert.match(html, /找不到這個頁面/);
  assert.match(html, /<main[\s\S]*<form action="\/search\/" method="get"[\s\S]*<\/main>/);
  assert.match(html, /href="\/datasets\/"/);
  assert.match(html, /href="\/courses\/"/);
  assert.match(html, /href="\/"/);
});

test('ordinary pages are not marked noindex', () => {
  const home = readFileSync(distPath('index.html'), 'utf8');
  assert.doesNotMatch(home, /name="robots" content="noindex"/);
});
