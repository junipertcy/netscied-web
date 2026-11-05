// Researcher-registry spec: the build fails if any public file contains something
// that looks like an email address or a Taiwanese phone number, other than the
// site's own contact address. scripts/build/check-site.mjs scans the built site.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../../scripts/build/check-site.mjs', import.meta.url));

function site(files) {
  const dir = mkdtempSync(path.join(tmpdir(), 'dist-'));
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), text);
  }
  return dir;
}

const run = (dir) => spawnSync(process.execPath, [cli, '--root', dir], { encoding: 'utf8' });

test('a clean site passes, and the site contact address is allowed', () => {
  const dir = site({ 'index.html': '<a href="mailto:hi@netscied.tw">hi@netscied.tw</a>', 'api/v1/x.json': '{"n": 912345678}', 'main-AAAAAAAA.js': 'x="someone@example.org"' });
  try {
    const res = run(dir);
    assert.equal(res.status, 0, res.stdout + res.stderr);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an email address in a page fails and names the file', () => {
  const dir = site({ 'courses/x/index.html': '<p>聯絡 someone@example.org</p>' });
  try {
    const res = run(dir);
    assert.notEqual(res.status, 0);
    assert.match(res.stderr, /courses\/x\/index\.html/);
    assert.match(res.stderr, /email/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a Taiwanese phone number in a Markdown sibling or JSON record fails', () => {
  for (const [rel, text] of [['datasets/x/index.md', '電話 0912-345-678'], ['api/v1/datasets/x.json', '{"d":"(02) 2345-6789"}']]) {
    const dir = site({ [rel]: text });
    try {
      const res = run(dir);
      assert.notEqual(res.status, 0, rel);
      assert.match(res.stderr, /phone/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

test('review 7: SVG files and web manifests are scanned too', () => {
  for (const [rel, text] of [['assets/img/x.svg', '<svg><text>someone@example.org</text></svg>'], ['site.webmanifest', '{"description":"0912-345-678"}']]) {
    const dir = site({ [rel]: text });
    try {
      assert.notEqual(run(dir).status, 0, rel);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

// Review of Milestone A, finding 9: deploy only a build the site check passed.
import { siteDigest, verifySiteStamp } from '../../scripts/build/check-site.mjs';

test('review 9: a passing check writes a stamp beside the site, and a changed file invalidates it', () => {
  const dir = site({ 'browser/index.html': '<p>ok</p>', 'browser/api/v1/index.json': '{}' });
  try {
    const res = spawnSync(process.execPath, [cli, '--root', path.join(dir, 'browser')], { encoding: 'utf8' });
    assert.equal(res.status, 0, res.stderr);
    assert.equal(verifySiteStamp(path.join(dir, 'browser')).ok, true);
    writeFileSync(path.join(dir, 'browser', 'index.html'), '<p>changed</p>');
    assert.equal(verifySiteStamp(path.join(dir, 'browser')).ok, false);
    assert.notEqual(siteDigest(path.join(dir, 'browser')), '');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('review 9: a failing check leaves no stamp', () => {
  const dir = site({ 'browser/index.html': '<p>someone@example.org</p>' });
  try {
    spawnSync(process.execPath, [cli, '--root', path.join(dir, 'browser')], { encoding: 'utf8' });
    assert.equal(verifySiteStamp(path.join(dir, 'browser')).ok, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
