// Task 2.3 — site-hosting spec "Edge logic fails open and stays small";
// site-structure spec "URL conventions" and "Legacy URLs keep working".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { edgeConfig, loadRedirects, renderFunction } from '../../scripts/edge/build-function.mjs';
import { loadHandler, viewerRequest } from '../helpers/cloudfront.mjs';
import { repoRoot } from '../helpers/dist.mjs';

const FUNCTION_PATH = path.join(repoRoot, 'infra', 'cloudfront', 'viewer-request.js');
const committed = readFileSync(FUNCTION_PATH, 'utf8');
const redirects = loadRedirects(readFileSync(path.join(repoRoot, 'config', 'redirects.yaml'), 'utf8'));
const handler = loadHandler(committed);
// The same function with every legacy row switched on, as Phase 1 will deploy it.
const phase1 = loadHandler(renderFunction(committed, edgeConfig(redirects, { includeDisabled: true })));

const run = (h, url, opts) => h(viewerRequest(url, opts));
const location = (res) => res.headers?.location?.value;

function assertRedirect(res, to) {
  assert.equal(res.statusCode, 301, `expected a 301, got ${JSON.stringify(res)}`);
  assert.equal(location(res), to);
}

function assertPassThrough(res, uri) {
  assert.equal(res.statusCode, undefined, `expected the request to continue, got ${JSON.stringify(res)}`);
  assert.equal(res.uri, uri);
}

test('the committed function embeds the current config/redirects.yaml', () => {
  assert.equal(committed, renderFunction(committed, edgeConfig(redirects)), 'run "pnpm edge:build" after editing config/redirects.yaml');
});

test('www redirects to the apex, keeping path and query', () => {
  assertRedirect(run(handler, '/courses/?a=1', { host: 'www.netscied.tw' }), 'https://netscied.tw/courses/?a=1');
  assertRedirect(run(handler, '/x', { host: 'www.netscied.tw' }), 'https://netscied.tw/x');
});

test('an extensionless path without a trailing slash gets one, query preserved', () => {
  assertRedirect(run(handler, '/datasets?x=1'), '/datasets/?x=1');
  assertRedirect(run(handler, '/stat1021'), '/stat1021/');
});

test('…/index.html redirects to the directory URL', () => {
  assertRedirect(run(handler, '/stat1021/index.html'), '/stat1021/');
  assertRedirect(run(handler, '/index.html?q=1'), '/?q=1');
});

test('a directory URL is served from its index.html', () => {
  assertPassThrough(run(handler, '/networks/'), '/networks/index.html');
  assertPassThrough(run(handler, '/'), '/index.html');
});

test('files with an extension pass through unchanged', () => {
  for (const uri of ['/main-XZNRWFHO.js', '/robots.txt', '/sitemap.xml', '/assets/img/cc-by-sa-small.png']) {
    assertPassThrough(run(handler, uri), uri);
  }
});

test('/.well-known/ paths reach the origin untouched, so missing ones are a plain 404', () => {
  assertPassThrough(run(handler, '/.well-known/does-not-exist'), '/.well-known/does-not-exist');
});

test('a percent-encoded Mandarin query survives a redirect byte for byte', () => {
  assertRedirect(run(handler, '/search?q=%E9%87%91%E9%A6%AC'), '/search/?q=%E9%87%91%E9%A6%AC');
});

test('repeated and value-less query parameters are preserved in order', () => {
  assertRedirect(run(handler, '/datasets?tag=a&tag=b&debug'), '/datasets/?tag=a&tag=b&debug');
});

for (const row of redirects.rows) {
  test(`redirect row ${row.from} → ${row.to} (enabled: ${row.enabled})`, () => {
    const target = (q) => {
      const hash = row.to.indexOf('#');
      return hash < 0 ? row.to + q : row.to.slice(0, hash) + q + row.to.slice(hash);
    };
    for (const variant of [row.from, `${row.from}/`, `${row.from}/index.html`]) {
      assertRedirect(run(phase1, `${variant}?x=1`), target('?x=1'));
    }
    if (!row.enabled) {
      // Phase 0: the old page keeps serving; only the slash rules apply.
      assertRedirect(run(handler, row.from), `${row.from}/`);
      assertPassThrough(run(handler, `${row.from}/`), `${row.from}/index.html`);
    }
  });
}

test('redirects carry a bounded cache lifetime, so later table changes reach browsers', () => {
  const res = run(handler, '/stat1021');
  assert.match(res.headers['cache-control'].value, /max-age=\d+/);
});

test('malformed requests pass through instead of failing', () => {
  const noHeaders = viewerRequest('/x/');
  delete noHeaders.request.headers;
  assertPassThrough(handler(noHeaders), '/x/index.html');

  const noQuery = viewerRequest('/x/');
  noQuery.request.querystring = null;
  assertPassThrough(handler(noQuery), '/x/index.html');

  const noUri = viewerRequest('/x/');
  delete noUri.request.uri;
  const res = handler(noUri);
  assert.equal(res.statusCode, undefined);
  assert.equal(res, noUri.request);

  const oddQuery = viewerRequest('/x');
  oddQuery.request.querystring = { q: {} };
  assertRedirect(handler(oddQuery), '/x/?q');
});

test('the function stays under the 10 KB CloudFront Functions limit', () => {
  assert.ok(statSync(FUNCTION_PATH).size < 10 * 1024, `${statSync(FUNCTION_PATH).size} bytes`);
});

test('the function uses no module syntax, which cloudfront-js-2.0 does not support', () => {
  assert.doesNotMatch(committed, /^\s*(import|export)\s/m);
  assert.doesNotMatch(committed, /\brequire\(/);
});

test('the redirect map rejects rows that would be ambiguous or unsafe', () => {
  const base = 'canonical_host: netscied.tw\nredirect_hosts: [www.netscied.tw]\npaths:\n';
  assert.throws(() => loadRedirects(`${base}  - {from: /a, to: /b/}\n  - {from: /a, to: /c/}\n`), /duplicate/);
  assert.throws(() => loadRedirects(`${base}  - {from: /a/, to: /b/}\n`), /trailing slash/);
  assert.throws(() => loadRedirects(`${base}  - {from: a, to: /b/}\n`), /start with "\/"/);
  assert.throws(() => loadRedirects(`${base}  - {from: /a, to: "javascript:x"}\n`), /"to"/);
});
