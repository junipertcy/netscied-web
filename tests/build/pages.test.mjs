// Tasks 5.1–5.6 — the prerendered pages, read as HTML without JavaScript
// (site-structure, dataset-catalog, course-catalog, agent-access specs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { parseHTML } from 'linkedom';
import { browserRoot, readDist } from '../helpers/dist.mjs';

const page = (rel) => parseHTML(readDist(rel)).document;
const api = (rel) => JSON.parse(readDist(`api/v1/${rel}`));
const text = (el) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const jsonld = (doc) => [...doc.querySelectorAll('script[type="application/ld+json"]')].map((s) => JSON.parse(s.textContent));

function htmlFiles(dir = browserRoot, prefix = '') {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) return f === 'api' || f === 'assets' ? [] : htmlFiles(p, `${prefix}${f}/`);
    return f === 'index.html' ? [`${prefix}${f}`] : [];
  });
}

// Pages Angular renders (the redirect fallbacks are written by the build from the redirect map).
const REDIRECT_PAGES = new Set(['networks/index.html', 'refs/index.html', 'booklet/index.html', 'tools/index.html']);
const pages = htmlFiles().filter((f) => !REDIRECT_PAGES.has(f));

test('task 5.1: every page is lang="zh-Hant-TW" with the four-item navigation, and no link to the removed pages', () => {
  for (const f of pages) {
    const doc = page(f);
    assert.equal(doc.documentElement.getAttribute('lang'), 'zh-Hant-TW', f);
    const nav = [...doc.querySelectorAll('header nav a')].map((a) => [text(a), a.getAttribute('href')]);
    assert.deepEqual(nav, [['資料集', '/datasets/'], ['課程', '/courses/'], ['消息', '/news/'], ['關於', '/about/']], f);
    for (const a of doc.querySelectorAll('a')) assert.ok(!['電腦工具', '網絡素養小冊'].includes(text(a)), `${f}: link to a removed page`);
  }
});

test('task 5.1: inner pages have a header search form; the home page has its own instead', () => {
  for (const f of pages) {
    const header = page(f).querySelector('header.site-header');
    const has = !!header.querySelector('form[action="/search/"][method="get"]');
    assert.equal(has, f !== 'index.html', f);
  }
});

test('task 5.1: the footer links to contribute, takedown and the contact address on every page', () => {
  for (const f of pages) {
    const hrefs = [...page(f).querySelectorAll('footer a')].map((a) => a.getAttribute('href'));
    for (const h of ['/about/#contribute', '/about/#takedown', 'mailto:hi@netscied.tw']) assert.ok(hrefs.includes(h), `${f}: ${h}`);
  }
});

test('task 5.1: every internal page link in the prerendered HTML ends in a slash', () => {
  for (const f of htmlFiles()) {
    for (const a of page(f).querySelectorAll('a[href]')) {
      const href = a.getAttribute('href');
      if (!href.startsWith('/') || href.startsWith('//')) continue;
      const pathPart = href.split(/[?#]/)[0];
      const last = pathPart.slice(pathPart.lastIndexOf('/') + 1);
      if (last.includes('.')) continue; // a file: /api/v1/index.json, /news/feed.xml, index.md
      assert.ok(pathPart.endsWith('/'), `${f}: ${href}`);
    }
  }
});

test('task 5.2: home shows the form, an honest count line and exactly the three newest news items', () => {
  const doc = page('index.html');
  const index = api('index.json');
  assert.ok(doc.querySelector('main form[action="/search/"] input[type="radio"][value="courses"]'));
  const count = text(doc.querySelector('.count-line'));
  assert.ok(count.includes(`目前收錄 ${index.counts.datasets} 筆資料集`), count);
  assert.ok(count.includes(`${index.counts.courses} 門課程`) && count.includes(`${index.counts.wanted} 項資料徵求中`), count);
  const news = api('news.json').slice(0, 3).map((n) => `/news/#${n.id}`);
  assert.deepEqual([...doc.querySelectorAll('.home-news li a')].map((a) => a.getAttribute('href')), news);
  assert.ok(doc.querySelectorAll('.examples a').length <= 5);
  assert.doesNotMatch(doc.body.textContent, /網絡是由節點和節點間的關聯所構成的集合/, 'the essay moved to /about/');
});

test('task 5.3: /datasets/ has one row per published dataset, no sort buttons, the caption, JSON and CSV links, and DataCatalog JSON-LD', () => {
  const doc = page('datasets/index.html');
  const n = api('datasets.json').length;
  assert.equal(doc.querySelectorAll('table.data-table tbody tr').length, n);
  assert.equal(text(doc.querySelector('caption')), `本站收錄的台灣網絡資料集（共 ${n} 筆）`);
  assert.equal(doc.querySelectorAll('.sort-bar button').length, 0, 'sort buttons appear only after hydration');
  assert.deepEqual([...doc.querySelectorAll('thead th')].map(text), ['名稱', '領域', '結構', '規模', '時間範圍', '授權', '最新版本']);
  const hrefs = [...doc.querySelectorAll('a')].map((a) => a.getAttribute('href'));
  for (const h of ['/api/v1/datasets.json', '/api/v1/datasets.csv', '/wanted/']) assert.ok(hrefs.includes(h), h);
  assert.ok(jsonld(doc).some((j) => j['@type'] === 'DataCatalog' && j.dataset.length === n));
  for (const d of api('datasets.json').filter((x) => !x.latest_version)) {
    const row = [...doc.querySelectorAll('tbody tr')].find((tr) => tr.querySelector(`a[href="/datasets/${d.id}/"]`));
    assert.match(text(row), /外部連結/, d.id);
  }
});

const SECTION_ORDER = ['重點資訊', /^(下載|取得資料)/, '如何引用', '授權與姓名標示', '蒐集者與貢獻者', '資料來源', '版本紀錄'];

test('task 5.4: every dataset page follows the spec section order, with Dataset JSON-LD, a JSON alternate and a visible index.md link', () => {
  for (const d of api('datasets.json')) {
    const doc = page(`datasets/${d.id}/index.html`);
    const h2 = [...doc.querySelectorAll('main h2')].map(text);
    let at = -1;
    for (const want of SECTION_ORDER) {
      const i = h2.findIndex((h, k) => k > at && (typeof want === 'string' ? h === want : want.test(h)));
      assert.ok(i > at, `${d.id}: section ${want} missing or out of order in ${h2.join(' / ')}`);
      at = i;
    }
    assert.ok(doc.querySelector(`link[rel="alternate"][type="application/json"][href="/api/v1/datasets/${d.id}.json"]`), d.id);
    assert.ok(doc.querySelector(`main a[href="/datasets/${d.id}/index.md"]`), `${d.id}: visible index.md link`);
    const ds = jsonld(doc).find((j) => j['@type'] === 'Dataset');
    for (const k of ['name', 'description', 'url', 'identifier', 'license', 'creator', 'isAccessibleForFree', 'spatialCoverage', 'keywords', 'includedInDataCatalog']) {
      assert.ok(ds?.[k] !== undefined, `${d.id}: JSON-LD ${k}`);
    }
    assert.ok(ds.description.length >= 50 && ds.description.length <= 5000, `${d.id}: description length`);
    assert.ok(jsonld(doc).some((j) => j['@type'] === 'BreadcrumbList'), d.id);
  }
});

test('task 5.4: JSON-LD facts are visible text on the page (license, spatial coverage, creators)', () => {
  for (const d of api('datasets.json')) {
    const doc = page(`datasets/${d.id}/index.html`);
    const body = text(doc.querySelector('main'));
    const ds = jsonld(doc).find((j) => j['@type'] === 'Dataset');
    const full = api(`datasets/${d.id}.json`);
    assert.ok(body.includes(full.license.name['zh-Hant']), `${d.id}: license name visible`);
    assert.ok(body.includes(ds.spatialCoverage.name), `${d.id}: spatial coverage visible`);
    for (const c of ds.creator) assert.ok(body.includes(c.name), `${d.id}: creator ${c.name} visible`);
    for (const k of ds.keywords) assert.ok(body.includes(k), `${d.id}: keyword ${k} visible`);
  }
});

test('task 5.4: a public-role dataset page states it names people in public roles and links the takedown procedure', () => {
  const doc = page('datasets/golden-horse-2018-nominations/index.html');
  const notice = [...doc.querySelectorAll('main section')].find((s) => text(s.querySelector('h2')) === '個人資料與下架');
  assert.ok(notice, 'personal-data section');
  assert.match(text(notice), /真實人物的姓名/);
  assert.ok(notice.querySelector('a[href="/about/#takedown"]'));
});

test('task 5.4: every dataset and course page has an In English section marked lang="en"', () => {
  for (const d of api('datasets.json')) assert.ok(page(`datasets/${d.id}/index.html`).querySelector('section[lang="en"]'), d.id);
  for (const c of api('courses.json').filter((x) => x.title.en)) assert.ok(page(`courses/${c.id}/index.html`).querySelector('section[lang="en"]'), c.id);
});

test('task 5.5: /wanted/ lists every wanted record with an anchor and no Dataset markup', () => {
  const doc = page('wanted/index.html');
  const rows = [...doc.querySelectorAll('tbody tr')];
  assert.equal(rows.length, api('wanted.json').length);
  assert.equal(rows.length, 7);
  for (const w of api('wanted.json')) assert.ok(doc.querySelector(`tr[id="${w.id}"]`), w.id);
  assert.ok(!jsonld(doc).some((j) => j['@type'] === 'Dataset'));
});

test('task 5.5: /courses/ has the table, the inclusion note and the international section outside the table', () => {
  const doc = page('courses/index.html');
  assert.equal(doc.querySelectorAll('table.data-table tbody tr').length, api('courses.json').length);
  assert.deepEqual([...doc.querySelectorAll('thead th')].map(text), ['課程名稱', '學校', '系所', '教師', '最近開課', '層級', '授課語言']);
  assert.ok(text(doc.querySelector('main')).includes('本站的「網路／網絡」指網絡科學（network science），非電腦網路課程'));
  const intl = doc.querySelector('section#international');
  assert.equal(text(intl.querySelector('h2')), '國外參考課程與教材（非台灣開課）');
  assert.equal(intl.querySelectorAll('li').length, JSON.parse(readDist('_data/international.json')).length);
  assert.ok(!doc.querySelector('table').textContent.includes('Stanford'));
});

test('task 5.5: a course page lists offerings newest first with a freshness label and Course + CourseInstance JSON-LD', () => {
  for (const c of api('courses.json')) {
    const doc = page(`courses/${c.id}/index.html`);
    const full = api(`courses/${c.id}.json`);
    assert.equal(text(doc.querySelector('.freshness')), full.freshness['zh-Hant'], c.id);
    assert.equal(doc.querySelectorAll('main table tbody tr').length, full.offerings.length, c.id);
    const course = jsonld(doc).find((j) => j['@type'] === 'Course');
    assert.equal(course.hasCourseInstance.length, full.offerings.length, c.id);
    assert.ok(doc.querySelector(`main a[href="/courses/${c.id}/index.md"]`), c.id);
  }
  const stat = page('courses/ncku-stat-intro-data-science/index.html');
  assert.equal(text(stat.querySelector('.freshness')), '歷史紀錄');
  assert.ok(stat.querySelector('a[href="https://netscied.tw/stat1021/"], a[href="/stat1021/"]'));
});

test('task 5.5: /news/ lists every item newest first with <time datetime> and its permanent anchor', () => {
  const doc = page('news/index.html');
  const items = [...doc.querySelectorAll('ol.news-list > li')];
  const news = api('news.json');
  assert.deepEqual(items.map((li) => li.getAttribute('id')), news.map((n) => n.id));
  for (const li of items) assert.match(li.querySelector('time').getAttribute('datetime'), /^\d{4}-\d{2}-\d{2}$/);
  const dates = news.map((n) => n.date);
  assert.deepEqual(dates, [...dates].sort().reverse());
  assert.ok(doc.querySelector('li#2019-03-12-scientific-american'));
});

test('task 5.5: /about/ has every anchor of the spec, the takedown, privacy and disclaimer texts and the CC0 statement', () => {
  const doc = page('about/index.html');
  for (const id of ['contribute', 'cite', 'takedown', 'privacy', 'disclaimer', 'booklet', 'machine-access', 'history', 'contact']) {
    assert.ok(doc.querySelector(`[id="${id}"]`), id);
  }
  const t = (id) => text(doc.querySelector(`#${id}`));
  assert.match(t('takedown'), /7 天內/);
  assert.match(t('takedown'), /3 天內/);
  assert.match(t('takedown'), /30 天內/);
  assert.ok(doc.querySelector('#takedown [lang="en"]'), 'English summary of the takedown procedure');
  assert.match(t('privacy'), /第 3 條/);
  assert.match(t('privacy'), /90 天/);
  assert.match(t('disclaimer'), /不構成法律意見/);
  assert.match(t('cite'), /CC0 1\.0/);
  assert.match(t('booklet'), /網絡素養/);
  assert.ok(doc.querySelector('#machine-access a[href="/api/v1/index.json"]'));
  assert.ok(doc.querySelector('#machine-access a[href="/llms.txt"]'));
});

test('task 5.5: /stat1021/ carries the archive banner and the link to its course record, and keeps its 2018 links', () => {
  const doc = page('stat1021/index.html');
  assert.equal(text(doc.querySelector('.archive-banner')), '2018 年課程封存頁 · Archived');
  assert.ok(doc.querySelector('a[href="/courses/ncku-stat-intro-data-science/"]'));
  const html = doc.body.innerHTML;
  // Owner decision 2026-11-04: the class questionnaire, its data and the networkie repository stay linked.
  assert.match(html, /github\.com\/junipertcy\/networkie/);
  assert.match(html, /In-class_network\.txt/);
  assert.match(html, /goo\.gl\/forms\/bpHjwDw8V56Rloeo1/);
  // No third-party slides are hosted by the site.
  assert.doesNotMatch(html, /href="\/[^"]*Clauset[^"]*\.pdf"/);
});

test('task 5.6: the redirect fallback pages send the legacy paths to their new homes', () => {
  const want = { networks: 'https://netscied.tw/datasets/', refs: 'https://netscied.tw/courses/', booklet: 'https://netscied.tw/about/#booklet', tools: 'https://github.com/junipertcy/Network-Code-Repository' };
  for (const [from, to] of Object.entries(want)) {
    const html = readDist(`${from}/index.html`);
    assert.ok(html.includes(`<meta http-equiv="refresh" content="0; url=${to}">`), `${from}: ${html.slice(0, 300)}`);
    assert.match(html, /name="robots" content="noindex"/);
  }
  assert.ok(!readFileSync(path.join(browserRoot, 'sitemap.xml'), 'utf8').match(/\/(networks|refs|booklet|tools)\//));
});
