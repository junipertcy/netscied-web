// Task 7.1 — machine-readable siblings of the pages (agent-access and
// site-structure specs): index.md per record, the Atom feed, llms.txt, and the
// news item a first publication generates.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOMParser } from 'linkedom';
import { parse, stringify } from 'yaml';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const fixture = path.join(repoRoot, 'tests', 'fixtures', 'catalog-base');
const cli = path.join(repoRoot, 'scripts', 'catalog', 'build.mjs');

function build(mutate) {
  const root = mkdtempSync(path.join(tmpdir(), 'cat-'));
  const out = mkdtempSync(path.join(tmpdir(), 'site-'));
  cpSync(fixture, root, { recursive: true });
  if (mutate) mutate(root);
  const res = spawnSync(process.execPath, [cli, '--root', root, '--out', out, '--today', '2026-11-04', '--no-git'], { encoding: 'utf8' });
  assert.equal(res.status, 0, res.stdout + res.stderr);
  return { root, out, read: (rel) => readFileSync(path.join(out, rel), 'utf8') };
}

let site;
before(() => (site = build()));
after(() => {
  rmSync(site.root, { recursive: true, force: true });
  rmSync(site.out, { recursive: true, force: true });
});

test('index.md of a hosted dataset has the title, description, structure, size, license, citation and download table', () => {
  const md = site.read('datasets/hosted-graph/index.md');
  assert.match(md, /^# 測試用託管網絡\n/);
  assert.match(md, /Hosted test network/);
  assert.match(md, /這是驗證器測試用的託管資料集/);
  assert.match(md, /結構.*有向/);
  assert.match(md, /規模.*3 個節點/);
  assert.match(md, /授權.*政府資料開放授權條款/);
  assert.match(md, /## 如何引用/);
  assert.match(md, /```bibtex\n@misc\{/);
  assert.match(md, /\| 格式 \| 檔案 \| 大小 \| SHA-256 \|/);
  assert.match(md, /0{63}1/);
  assert.doesNotMatch(md, /<app-root|<script/);
});

test('index.md of a link-only dataset gives the upstream access links and license statement instead of downloads', () => {
  const md = site.read('datasets/link-only-graph/index.md');
  assert.match(md, /## 取得資料/);
  assert.match(md, /https:\/\/example\.org\/other\/download/);
  assert.doesNotMatch(md, /SHA-256/);
});

test('a withdrawn dataset has a tombstone index.md, and a course has its own', () => {
  assert.match(site.read('datasets/withdrawn-thing/index.md'), /已於 2026-10-20 下架/);
  const md = site.read('courses/test-graph-theory/index.md');
  assert.match(md, /^# 測試圖論\n/);
  assert.match(md, /114-1（2025 秋）/);
  assert.match(md, /測試老師/);
  assert.match(md, /https:\/\/example\.org\/course/);
});

test('the Atom feed is well-formed Atom with stable entry ids, newest first, at most 20 entries', () => {
  const xml = site.read('news/feed.xml');
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const feed = doc.documentElement;
  assert.equal(feed.tagName, 'feed');
  assert.equal(feed.getAttribute('xmlns'), 'http://www.w3.org/2005/Atom');
  const child = (el, name) => [...el.childNodes].filter((n) => n.tagName === name);
  for (const name of ['id', 'title', 'updated', 'author', 'link']) assert.ok(child(feed, name).length, `feed ${name}`);
  assert.ok(child(feed, 'link').some((l) => l.getAttribute('rel') === 'self' && l.getAttribute('href') === 'https://netscied.tw/news/feed.xml'));
  const entries = child(feed, 'entry');
  assert.ok(entries.length >= 1 && entries.length <= 20);
  const news = JSON.parse(site.read('api/v1/news.json'));
  assert.equal(child(entries[0], 'id')[0].textContent, `https://netscied.tw/news/#${news[0].id}`);
  for (const e of entries) {
    for (const name of ['id', 'title', 'updated', 'link']) assert.ok(child(e, name).length, `entry ${name}`);
    assert.match(child(e, 'updated')[0].textContent, /^\d{4}-\d{2}-\d{2}T00:00:00\+08:00$/);
  }
});

test('llms.txt orients an agent in Mandarin and English: the API index, structure kinds, license and citation', () => {
  const txt = site.read('llms.txt');
  assert.match(txt, /^# 台灣網絡科學教育/);
  assert.match(txt, /https:\/\/netscied\.tw\/api\/v1\/index\.json/);
  assert.match(txt, /structure\.kinds/);
  assert.match(txt, /license\.id/);
  assert.match(txt, /citation/);
  assert.match(txt, /CC0 1\.0/);
  assert.match(txt, /\/datasets\/<id>\//);
  assert.match(txt, /index\.md/);
});

test('a wanted record that becomes published generates exactly one news item, in news.json and the feed', () => {
  const before = JSON.parse(site.read('api/v1/news.json'));
  assert.equal(before.filter((n) => n.generated).length, 0);
  const pub = build((root) => {
    const f = path.join(root, 'catalog', 'datasets', 'wanted-thing.yaml');
    const src = parse(readFileSync(path.join(root, 'catalog', 'datasets', 'link-only-graph.yaml'), 'utf8'));
    const w = parse(readFileSync(f, 'utf8'));
    delete src.announce;
    writeFileSync(f, stringify({ ...src, id: 'wanted-thing', added: w.added, published: '2026-11-04', title: { 'zh-Hant': '測試徵求項目', en: 'Wanted test item' }, wanted: w.wanted }));
  });
  try {
    const news = JSON.parse(pub.read('api/v1/news.json'));
    const generated = news.filter((n) => n.generated);
    assert.equal(generated.length, 1);
    assert.equal(generated[0].id, '2026-11-04-wanted-thing');
    assert.deepEqual(generated[0].related, { datasets: ['wanted-thing'] });
    assert.match(pub.read('news/feed.xml'), /2026-11-04-wanted-thing/);
    assert.equal(JSON.parse(pub.read('api/v1/wanted.json')).find((w) => w.id === 'wanted-thing').status, 'published');
  } finally {
    rmSync(pub.root, { recursive: true, force: true });
    rmSync(pub.out, { recursive: true, force: true });
  }
  assert.ok(existsSync(path.join(site.out, 'news', 'feed.xml')));
});

test('final review W12: feed entries carry absolute links, since feed readers have no base for /paths', () => {
  const pub = build((root) => {
    const f = path.join(root, 'content', 'news');
    const name = readdirSync(f).find((n) => n.endsWith('.md'));
    writeFileSync(path.join(f, name), readFileSync(path.join(f, name), 'utf8') + '\n見[資料集](/datasets/)與<img src="/assets/x.png" alt="">。\n');
  });
  try {
    const xml = pub.read('news/feed.xml');
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    const html = [...doc.documentElement.childNodes].filter((n) => n.tagName === 'entry').map((e) => [...e.childNodes].find((c) => c.tagName === 'content').textContent).join('\n');
    assert.match(html, /href="https:\/\/netscied\.tw\/datasets\/"/);
    assert.match(html, /src="https:\/\/netscied\.tw\/assets\/x\.png"/);
    assert.doesNotMatch(html, /(href|src)="\/(?!\/)/);
  } finally {
    rmSync(pub.root, { recursive: true, force: true });
    rmSync(pub.out, { recursive: true, force: true });
  }
});
