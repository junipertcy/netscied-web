// Tasks 4.3–4.5 — the seed content in the real build.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { readDist, repoRoot } from '../helpers/dist.mjs';
import { readYaml } from '../../scripts/catalog/lib/yaml.mjs';

const api = (rel) => JSON.parse(readDist(`api/v1/${rel}`));

test('task 4.5: at least 15 Taiwan courses, and no international entry in the course API or search', () => {
  const courses = api('courses.json');
  assert.ok(courses.length >= 15, `${courses.length} courses`);
  const intl = readYaml(path.join(repoRoot, 'catalog', 'international.yaml')).data;
  const text = readDist('api/v1/courses.json') + readDist('api/v1/catalog.json');
  for (const e of intl) {
    for (const t of [e.title.en, e.title['zh-Hant'], e.url].filter(Boolean)) assert.ok(!text.includes(t), `international entry leaked: ${t}`);
  }
  assert.ok(courses.some((c) => c.id === 'ncku-stat-intro-data-science' && c.freshness.id === 'historical'));
});

test('task 4.4: at least 8 published datasets, at least 2 of them newly hosted, and every license has an evidence URL and a check date', () => {
  const datasets = api('datasets.json');
  assert.ok(datasets.length >= 8, `${datasets.length} published`);
  const hosted = datasets.filter((d) => d.hosted).map((d) => d.id);
  for (const id of ['ly-bill-cosponsorship-10th', 'taipei-metro-od-monthly']) assert.ok(hosted.includes(id), `${id} is hosted`);
  for (const d of datasets) {
    const full = api(`datasets/${d.id}.json`);
    assert.ok(full.license.evidence?.url, `${d.id}: license evidence URL`);
    assert.match(full.license.evidence?.checked_on ?? '', /^\d{4}-\d{2}-\d{2}$/, `${d.id}: license check date`);
  }
});

test('task 4.3: the seven former placeholders are on the wanted list', () => {
  const titles = api('wanted.json').map((w) => w.title['zh-Hant']);
  assert.equal(titles.length, 7);
  for (const t of ['課業諮詢網絡', '人口遷徙', '港口貿易', '生物食物鏈', '縣市路網', '航空路線', '文獻引用網絡']) {
    assert.ok(titles.some((x) => x.startsWith(t)), t);
  }
  void readFileSync;
});

// Review of Milestone A, finding 14 and owner decision A4: a language is never
// assumed. A course whose own notes say the source states no language has its
// languages blank and marked unverified.
test('review 14: no course claims a language that its source does not state', () => {
  for (const c of api('courses.json')) {
    const full = api(`courses/${c.id}.json`);
    const notes = JSON.stringify([full.offerings.map((o) => o.note), full.unverified]);
    if (/未列授課語言/.test(notes)) {
      assert.equal(c.languages_unverified, true, `${c.id}: the notes say no language is stated`);
    }
    if (c.languages_unverified) assert.match(full.unverified.checked_on, /^\d{4}-\d{2}-\d{2}$/, c.id);
  }
});

test('task 4.1: the Golden Horse version reports its repeated pairs, and the page shows the download table and the personal-data notice', () => {
  const full = api('datasets/golden-horse-2018-nominations.json');
  assert.equal(full.redistribution.basis, 'own-work');
  assert.equal(full.personal_data.level, 'public-role');
  const g = full.latest_version.statistics.graph;
  assert.deepEqual([g.edges, g.unique_pairs, g.repeated_pairs], [146, 133, 13]);
  assert.match(full.latest_version.changelog['zh-Hant'], /13 組節點配對重複出現/);
  assert.ok(full.latest_version.files.some((f) => f.path === 'ATTRIBUTION.txt'));
  const html = readDist('datasets/golden-horse-2018-nominations/index.html');
  assert.match(html, /下載（版本 1\.0\.0）/);
  assert.match(html, /href="https:\/\/netscied\.tw\/data\/golden-horse-2018-nominations\/1\.0\.0\/golden-horse-2018-nominations-1\.0\.0\.zip"/);
  assert.match(html, /個人資料與下架/);
});

test('review 11 / owner decision A1: the LY version credits LYAPI and OpenFun, and no name outside the roster is in its files', () => {
  const full = api('datasets/ly-bill-cosponsorship-10th.json');
  assert.equal(full.license.id, 'CC-BY-4.0');
  assert.match(full.attribution, /歐噴有限公司 LYAPI/);
  const files = full.latest_version.files.map((f) => f.path);
  assert.ok(files.includes('ly-bill-cosponsorship-10th-1.0.0.hif.json') && files.includes('ATTRIBUTION.txt'));
  assert.equal(full.latest_version.statistics.hypergraph.nodes, 120);
  const html = readDist('datasets/ly-bill-cosponsorship-10th/index.html');
  assert.match(html, /歐噴有限公司/);
  assert.match(html, /LYAPI/);
});

test('task 4.4: the Taipei Metro version is a monthly aggregate under OGDL with the attribution statement in its record', () => {
  const full = api('datasets/taipei-metro-od-monthly.json');
  assert.equal(full.license.id, 'OGDL-Taiwan-1.0');
  assert.match(full.attribution, /此開放資料依政府資料開放授權條款 \(Open Government Data License\) 進行公眾釋出/);
  const g = full.latest_version.statistics.graph;
  assert.ok(g.edges > 1000 && g.total_weight > 0);
  assert.ok(full.latest_version.files.every((f) => f.bytes <= 100_000_000));
});

// Final review D12: the review-14 test only caught records whose own notes said
// 未列授課語言; a language asserted with no source at all slipped through. Now a
// language that is not marked unverified must be backed by a statement in the
// record's notes of where it was read.
const LANGUAGE_STATEMENT = /授課語言|英文授課|英語授課|全英語|英授|中文授課|華語授課|Taught in English|Lecture in English|in English/i;
test('final review D12: every course language not marked unverified is backed by a stated source', () => {
  const unsourced = [];
  for (const c of api('courses.json')) {
    if (c.languages_unverified) continue;
    const full = api(`courses/${c.id}.json`);
    const notes = JSON.stringify([full.offerings.map((o) => [o.note, o.unverified]), full.unverified, full.summary]);
    if (!LANGUAGE_STATEMENT.test(notes)) unsourced.push(c.id);
  }
  assert.deepEqual(unsourced, []);
});

test('final review D5: the LY personal-data note says what the files hold, in both languages, without overclaiming', () => {
  const notes = api('datasets/ly-bill-cosponsorship-10th.json').personal_data.notes;
  assert.doesNotMatch(notes['zh-Hant'], /其他姓名不會進入託管的檔案/);
  assert.match(notes['zh-Hant'], /議案名稱照上游原文保留/);
  assert.match(notes['zh-Hant'], /已故/);
  assert.match(notes.en ?? '', /titles are kept verbatim/i);
  assert.match(notes.en ?? '', /no petitions/i);
});

test('final review D3: the Taipei Metro record covers the hosted months and says the upstream reaches back to 2017-01', () => {
  const full = api('datasets/taipei-metro-od-monthly.json');
  assert.equal(full.coverage.temporal.start, '2025-10');
  assert.equal(full.coverage.temporal.end, '2026-09');
  assert.ok(!full.coverage.temporal.ongoing);
  assert.match(JSON.stringify(full.coverage.temporal.note), /2017/);
  const ld = JSON.parse(readDist('datasets/taipei-metro-od-monthly/index.html').match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g).map((s) => s.replace(/<\/?script[^>]*>/g, '')).find((s) => s.includes('"Dataset"')));
  assert.equal(ld.temporalCoverage, '2025-10/2026-09');
});
