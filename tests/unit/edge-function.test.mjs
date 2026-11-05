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

const SITE = 'https://netscied.tw';
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
  // Path rules apply in the same hop, so an unslashed www path needs one redirect, not two.
  assertRedirect(run(handler, '/x', { host: 'www.netscied.tw' }), 'https://netscied.tw/x/');
});

test('an extensionless path without a trailing slash gets one, query preserved', () => {
  assertRedirect(run(handler, '/datasets?x=1'), `${SITE}/datasets/?x=1`);
  assertRedirect(run(handler, '/stat1021'), `${SITE}/stat1021/`);
});

test('…/index.html redirects to the directory URL', () => {
  assertRedirect(run(handler, '/stat1021/index.html'), `${SITE}/stat1021/`);
  assertRedirect(run(handler, '/index.html?q=1'), `${SITE}/?q=1`);
});

test('a directory URL is served from its index.html', () => {
  assertPassThrough(run(handler, '/stat1021/'), '/stat1021/index.html');
  assertPassThrough(run(handler, '/datasets/golden-horse-2018-nominations/'), '/datasets/golden-horse-2018-nominations/index.html');
  assertPassThrough(run(handler, '/'), '/index.html');
});

test('files with an extension pass through unchanged', () => {
  for (const uri of ['/main-XZNRWFHO.js', '/robots.txt', '/sitemap.xml', '/assets/img/cc-by-sa-small.png']) {
    assertPassThrough(run(handler, uri), uri);
  }
});

test('task 8.8: /data/ files without an extension (SHA256SUMS) reach the origin untouched, not as directories', () => {
  assertPassThrough(run(handler, '/data/golden-horse-2018-nominations/1.0.0/SHA256SUMS'), '/data/golden-horse-2018-nominations/1.0.0/SHA256SUMS');
  assertPassThrough(run(handler, '/data/golden-horse-2018-nominations/1.0.0/nodes.csv'), '/data/golden-horse-2018-nominations/1.0.0/nodes.csv');
});

test('owner decision A7: the legacy project folders are served exactly as before the relaunch', () => {
  // Extensionless files (a .git object, LICENSE) get no slash, index.html is not
  // redirected, and a folder URL is not rewritten to its index.html.
  for (const uri of [
    '/greenpeace/jp/.git/config',
    '/greenpeace/jp/node_modules/leaflet/LICENSE',
    '/greenpeace/jp/index.html',
    '/greenpeace/jp/',
    '/data_taipei/view-cht/index.html',
    '/sensoro/network.m4v',
  ]) {
    assertPassThrough(run(handler, uri), uri);
  }
});

test('legacy project folders still move from www to the apex, unchanged otherwise', () => {
  assertRedirect(run(handler, '/greenpeace/jp/.git/config', { host: 'www.netscied.tw' }), `${SITE}/greenpeace/jp/.git/config`);
});

test('a path that only starts like a legacy folder gets the usual slash rule', () => {
  assertRedirect(run(handler, '/greenpeace-x'), `${SITE}/greenpeace-x/`);
  assertRedirect(run(handler, '/greenpeace'), `${SITE}/greenpeace/`);
});

test('/.well-known/ paths reach the origin untouched, so missing ones are a plain 404', () => {
  assertPassThrough(run(handler, '/.well-known/does-not-exist'), '/.well-known/does-not-exist');
});

test('a percent-encoded Mandarin query survives a redirect byte for byte', () => {
  assertRedirect(run(handler, '/search?q=%E9%87%91%E9%A6%AC'), `${SITE}/search/?q=%E9%87%91%E9%A6%AC`);
});

test('repeated and value-less query parameters are preserved in order', () => {
  assertRedirect(run(handler, '/datasets?tag=a&tag=b&debug'), `${SITE}/datasets/?tag=a&tag=b&debug`);
});

for (const row of redirects.rows) {
  test(`redirect row ${row.from} → ${row.to} (enabled: ${row.enabled})`, () => {
    const target = (q) => {
      const to = row.to.startsWith('/') ? SITE + row.to : row.to;
      const hash = to.indexOf('#');
      return hash < 0 ? to + q : to.slice(0, hash) + q + to.slice(hash);
    };
    for (const variant of [row.from, `${row.from}/`, `${row.from}/index.html`]) {
      assertRedirect(run(phase1, `${variant}?x=1`), target('?x=1'));
    }
    if (!row.enabled) {
      // Phase 0: the old page keeps serving; only the slash rules apply.
      assertRedirect(run(handler, row.from), `${SITE}${row.from}/`);
      assertPassThrough(run(handler, `${row.from}/`), `${row.from}/index.html`);
    }
  });
}

// Review finding (critical): a leading // made the slash rule emit a protocol-relative
// Location (//evil.example/x/), an open redirect.
test('no crafted path can redirect a browser off the site', () => {
  const paths = [
    '//evil.example/x', '//evil.example/index.html', '///evil.example/x', '/\\evil.example/x',
    '/\\/evil.example/x', '//evil.example', '/%2F%2Fevil.example/x',
  ];
  for (const host of ['netscied.tw', 'www.netscied.tw']) {
    for (const p of paths) {
      const res = run(handler, `${p}?a=1`, { host });
      if (res.statusCode === undefined) continue;
      // Resolve the way a browser does (WHATWG URL treats \ as / in https URLs).
      const target = new URL(location(res), 'https://netscied.tw/');
      assert.equal(target.host, 'netscied.tw', `${host}${p} → ${location(res)}`);
    }
  }
});

test('repeated slashes redirect to the collapsed path', () => {
  assertRedirect(run(handler, '//stat1021/'), `${SITE}/stat1021/`);
  // A legacy path keeps its redirect when the slashes are doubled.
  assertRedirect(run(handler, '//networks/'), `${SITE}/datasets/`);
  assertRedirect(run(handler, '/stat1021//index.html'), `${SITE}/stat1021/`);
});

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
  assertRedirect(handler(oddQuery), `${SITE}/x/?q`);
});

test('the function stays under the 10 KB CloudFront Functions limit', () => {
  assert.ok(statSync(FUNCTION_PATH).size < 10 * 1024, `${statSync(FUNCTION_PATH).size} bytes`);
});

// cloudfront-js-2.0 does accept `import cf from 'cloudfront'`; the function avoids
// module syntax so that the vm harness here and scripts/preview.mjs can run it as
// a plain script (task 11.8).
test('the function uses no module syntax, so the vm harness and the preview server can run it as a script', () => {
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
