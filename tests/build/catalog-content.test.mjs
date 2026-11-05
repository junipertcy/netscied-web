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

test('task 4.4: at least 8 published datasets, and every license has an evidence URL and a check date', () => {
  const datasets = api('datasets.json');
  assert.ok(datasets.length >= 8, `${datasets.length} published`);
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
