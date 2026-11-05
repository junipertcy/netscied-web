// Task 3.1 — the local preview server behaves like CloudFront in front of the
// bucket: the viewer-request function runs first, directory URLs serve index.html,
// a missing key gets /404/index.html with status 404, and machine files carry the
// content types the deploy sets.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startPreview } from '../../scripts/preview.mjs';

let root;
let server;
let base;

before(async () => {
  root = mkdtempSync(path.join(tmpdir(), 'preview-'));
  mkdirSync(path.join(root, 'datasets'), { recursive: true });
  mkdirSync(path.join(root, '404'), { recursive: true });
  mkdirSync(path.join(root, 'api', 'v1'), { recursive: true });
  writeFileSync(path.join(root, 'index.html'), '<p>home</p>');
  writeFileSync(path.join(root, 'datasets', 'index.html'), '<p>datasets</p>');
  writeFileSync(path.join(root, '404', 'index.html'), '<p>找不到這個頁面</p>');
  writeFileSync(path.join(root, 'api', 'v1', 'index.json'), '{"ok":true}');
  writeFileSync(path.join(root, 'robots.txt'), 'User-agent: *\n');
  server = await startPreview({ root, port: 0 });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  rmSync(root, { recursive: true, force: true });
});

const get = (p, init) => fetch(base + p, { redirect: 'manual', ...init });

test('a directory URL serves its index.html', async () => {
  const res = await get('/datasets/');
  assert.equal(res.status, 200);
  assert.match(await res.text(), /datasets/);
  assert.match(res.headers.get('content-type'), /^text\/html; charset=utf-8/);
});

test('an extensionless path is redirected to its slash form by the edge function', async () => {
  const res = await get('/datasets?x=1');
  assert.equal(res.status, 301);
  assert.equal(res.headers.get('location'), 'https://netscied.tw/datasets/?x=1');
});

test('a missing path answers 404 with the not-found page', async () => {
  const res = await get('/does-not-exist/');
  assert.equal(res.status, 404);
  assert.match(await res.text(), /找不到這個頁面/);
});

test('machine files carry their deploy content types', async () => {
  assert.equal((await get('/api/v1/index.json')).headers.get('content-type'), 'application/json; charset=utf-8');
  assert.equal((await get('/robots.txt')).headers.get('content-type'), 'text/plain; charset=utf-8');
});

test('paths cannot escape the served directory', async () => {
  const res = await get('/..%2f..%2fetc/passwd');
  assert.notEqual(res.status, 200);
});
