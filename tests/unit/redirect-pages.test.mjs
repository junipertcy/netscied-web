// Task 5.6 — fallback pages for the legacy redirects, written from the same
// config/redirects.yaml the CloudFront function embeds. CloudFront answers these
// paths with a 301 before the bucket; the pages cover a bare origin.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { redirectPage, writeRedirectPages } from '../../scripts/build/redirect-pages.mjs';

const MAP = `canonical_host: netscied.tw
redirect_hosts: [www.netscied.tw]
paths:
  - { from: /networks, to: /datasets/ }
  - { from: /booklet, to: /about/#booklet }
  - { from: /tools, to: "https://github.com/junipertcy/Network-Code-Repository" }
  - { from: /refs, to: /courses/, enabled: false }
`;

test('a redirect page refreshes to the absolute target, links it, and is noindex', () => {
  const html = redirectPage('https://netscied.tw/about/#booklet');
  assert.match(html, /<meta http-equiv="refresh" content="0; url=https:\/\/netscied\.tw\/about\/#booklet">/);
  assert.match(html, /<a href="https:\/\/netscied\.tw\/about\/#booklet">/);
  assert.match(html, /<meta name="robots" content="noindex">/);
  assert.match(html, /<html lang="zh-Hant-TW">/);
});

test('one page per enabled row, none for disabled rows', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'redir-'));
  try {
    const written = writeRedirectPages(MAP, dir);
    assert.deepEqual(written.sort(), ['booklet/index.html', 'networks/index.html', 'tools/index.html']);
    assert.match(readFileSync(path.join(dir, 'networks', 'index.html'), 'utf8'), /url=https:\/\/netscied\.tw\/datasets\//);
    assert.match(readFileSync(path.join(dir, 'tools', 'index.html'), 'utf8'), /url=https:\/\/github\.com\/junipertcy\/Network-Code-Repository"/);
    assert.ok(!existsSync(path.join(dir, 'refs')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
