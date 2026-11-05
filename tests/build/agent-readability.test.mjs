// Task 7.4 — agent readability (design D7): an agent that fetches a page without
// running JavaScript and converts it to Markdown finds the key facts within the
// first 100,000 characters (Claude Code's WebFetch reads 100k).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readDist } from '../helpers/dist.mjs';
import { pageAsMarkdown, readabilityReport } from '../../scripts/agent-readability.mjs';

const api = (rel) => JSON.parse(readDist(`api/v1/${rel}`));

test('converting a page to Markdown keeps the main content and drops scripts and styles', () => {
  const md = pageAsMarkdown(readDist('datasets/golden-horse-2018-nominations/index.html'));
  assert.match(md, /第55屆金馬獎入圍者–電影網絡/);
  assert.doesNotMatch(md, /<script|ng-state|function\(/);
});

test('every dataset page: title, license and the downloads or access links fall within the first 100k characters', () => {
  for (const d of api('datasets.json')) {
    const full = api(`datasets/${d.id}.json`);
    const must = [full.title['zh-Hant'], full.license.name['zh-Hant']];
    if (full.latest_version) must.push(...full.latest_version.files.map((f) => f.url));
    else must.push(...full.access.map((a) => a.url));
    const r = readabilityReport(readDist(`datasets/${d.id}/index.html`), must);
    assert.deepEqual(r.missing, [], `${d.id}: missing within 100k characters`);
  }
});

test('every course page and the list pages carry their key facts within 100k characters', () => {
  for (const c of api('courses.json')) {
    const full = api(`courses/${c.id}.json`);
    const r = readabilityReport(readDist(`courses/${c.id}/index.html`), [full.title['zh-Hant'], full.university['zh-Hant'], ...full.offerings.map((o) => o.evidence_url)]);
    assert.deepEqual(r.missing, [], c.id);
  }
  const titles = api('datasets.json').map((d) => d.title['zh-Hant']);
  assert.deepEqual(readabilityReport(readDist('datasets/index.html'), titles).missing, []);
  assert.deepEqual(readabilityReport(readDist('about/index.html'), ['下架與更正', 'CC0 1.0', '/api/v1/index.json']).missing, []);
});
