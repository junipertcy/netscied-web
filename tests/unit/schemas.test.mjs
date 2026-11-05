// Task 3.2 — the JSON Schemas in schemas/v1 compile under ajv (draft 2020-12),
// accept good records and reject deliberately bad ones.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSchemas, schemaErrors } from '../../scripts/catalog/lib/schemas.mjs';
import { parseYamlText } from '../../scripts/catalog/lib/yaml.mjs';

const s = loadSchemas();
const clone = (x) => structuredClone(x);

const PUBLISHED = {
  id: 'example-dataset',
  status: 'published',
  added: '2026-11-04',
  title: { 'zh-Hant': '範例資料集', en: 'Example dataset' },
  description: { 'zh-Hant': '這是一筆測試用的資料集描述，內容需要至少五十個字，所以這裡寫得比較長一些，說明節點、連結與資料來源，以及授權。' },
  semantics: { node: { 'zh-Hant': '車站' }, link: { 'zh-Hant': '兩站之間的旅次' } },
  structure: { kinds: ['graph'], directed: true, weighted: true, weight: { meaning: { 'zh-Hant': '旅次數' } } },
  domains: ['transport'],
  taiwan_relevance: { basis: ['collected-in-taiwan'], justification: '在臺北蒐集的資料。' },
  provenance: { source: { name: { 'zh-Hant': '來源' }, url: 'https://example.org/' } },
  license: { id: 'OGDL-Taiwan-1.0' },
  redistribution: { basis: 'license-permits' },
  personal_data: { level: 'none', reviewed_on: '2026-11-04' },
};

const WANTED = {
  id: 'example-wanted',
  status: 'wanted',
  added: '2026-11-04',
  title: { 'zh-Hant': '範例徵求' },
  description: { 'zh-Hant': '短描述' },
  domains: ['society'],
  wanted: { reason: { 'zh-Hant': '舊網站的搜集中項目' } },
};

const MANIFEST = {
  dataset: 'example-dataset',
  version: '1.0.0',
  released: '2026-11-05',
  changelog: { 'zh-Hant': '第一版' },
  files: [
    {
      path: 'example-dataset-1.0.0.graphml',
      url: 'https://netscied.tw/data/example-dataset/1.0.0/example-dataset-1.0.0.graphml',
      bytes: 10,
      sha256: 'a'.repeat(64),
      media_type: 'application/graphml+xml',
      format: 'graphml',
      role: 'convenience',
    },
  ],
  statistics: { graph: { nodes: 2, edges: 1 } },
  computed_by: { tool: 'netscied', version: '0.1.0' },
};

const PERSON = {
  id: 'p-7K3M9QX2',
  name: { 'zh-Hant': '王小明' },
  consented_on: '2026-11-04',
  display: ['name'],
};

const COURSE = {
  id: 'example-course',
  university: 'ntu',
  department: { 'zh-Hant': '數學系' },
  title: { 'zh-Hant': '圖論' },
  category: 'graph-theory',
  relevance: 'core',
  offering_type: 'credit',
  level: 'master',
  languages: ['zh'],
  inclusion_note: { 'zh-Hant': '整學期講授圖論。' },
  provenance: { found_via: 'manual', added: '2026-11-04', reviewed: '2026-11-04' },
  offerings: [{ term: '114-1', instructors: [{ name: '某老師' }], evidence_url: 'https://example.org/c', verified_on: '2026-11-04' }],
};

const ok = (validator, data) => assert.deepEqual(schemaErrors(validator, data), []);
const bad = (validator, data, field) => {
  const errs = schemaErrors(validator, data);
  assert.ok(errs.length > 0, 'expected the schema to reject this record');
  if (field) assert.ok(errs.some((e) => e.field === field), `expected an error on ${field}, got ${JSON.stringify(errs)}`);
};

test('all schemas compile under ajv 2020 in strict mode', () => {
  assert.deepEqual(s.files.sort(), [
    'common.schema.json', 'course.schema.json', 'dataset.schema.json', 'news.schema.json',
    'person.schema.json', 'recipe.schema.json', 'version.schema.json', 'vocab.schema.json',
  ]);
});

test('good records validate', () => {
  ok(s.dataset, PUBLISHED);
  ok(s.dataset, WANTED);
  ok(s.version, MANIFEST);
  ok(s.person, PERSON);
  ok(s.course, COURSE);
  ok(s.news, { id: '2019-03-12-scientific-american', date: '2019-03-12', title: { 'zh-Hant': '科學人' } });
});

test('a published record must carry the whole required core', () => {
  for (const field of ['title', 'description', 'semantics', 'structure', 'domains', 'taiwan_relevance', 'provenance', 'license', 'redistribution', 'personal_data']) {
    const r = clone(PUBLISHED);
    delete r[field];
    bad(s.dataset, r, field);
  }
});

test('a published record needs an English title and a 50-character Mandarin description', () => {
  const noEn = clone(PUBLISHED);
  delete noEn.title.en;
  bad(s.dataset, noEn, 'title.en');
  const short = clone(PUBLISHED);
  short.description['zh-Hant'] = '網'.repeat(49);
  bad(s.dataset, short, 'description.zh-Hant');
  short.description['zh-Hant'] = '網'.repeat(50);
  ok(s.dataset, short);
});

test('the personal-data level and its review date are required, with the four levels only', () => {
  const r = clone(PUBLISHED);
  delete r.personal_data.reviewed_on;
  bad(s.dataset, r, 'personal_data.reviewed_on');
  const old = clone(PUBLISHED);
  old.personal_data.level = 'pseudonymized';
  bad(s.dataset, old, 'personal_data.level');
});

test('NOASSERTION or NONE cannot be redistributed under license-permits', () => {
  for (const id of ['NOASSERTION', 'NONE']) {
    const r = clone(PUBLISHED);
    r.license.id = id;
    bad(s.dataset, r, 'redistribution.basis');
  }
});

test('written-permission needs an opaque permission_ref', () => {
  const r = clone(PUBLISHED);
  r.redistribution = { basis: 'written-permission' };
  bad(s.dataset, r, 'redistribution.permission_ref');
  r.redistribution.permission_ref = 'perm-2026-0003';
  ok(s.dataset, r);
});

test('a LicenseRef needs a name and a URL', () => {
  const r = clone(PUBLISHED);
  r.license = { id: 'LicenseRef-TW-LY-Open-Data-Declaration' };
  bad(s.dataset, r, 'license.name');
  r.license.name = { 'zh-Hant': '立法院網站資料開放宣告' };
  r.license.url = 'https://data.ly.gov.tw/copyprotection.action';
  ok(s.dataset, r);
});

test('a graph must say whether it is directed and weighted; a weight needs its meaning', () => {
  const r = clone(PUBLISHED);
  delete r.structure.directed;
  bad(s.dataset, r, 'structure.directed');
  const w = clone(PUBLISHED);
  delete w.structure.weight;
  bad(s.dataset, w, 'structure.weight');
});

test('a ranking needs its PrefLib data type; a pairwise comparison its outcome', () => {
  const r = clone(PUBLISHED);
  r.structure = { kinds: ['ranking'] };
  bad(s.dataset, r, 'structure.ranking');
  r.structure.ranking = { data_type: 'soc' };
  ok(s.dataset, r);
  const p = clone(PUBLISHED);
  p.structure = { kinds: ['pairwise-comparison'] };
  bad(s.dataset, p, 'structure.comparison');
});

test('a multilayer hypergraph needs no combined kind', () => {
  const r = clone(PUBLISHED);
  r.structure = { kinds: ['hypergraph'], layers: 'multilayer', temporal: { form: 'event-times' } };
  ok(s.dataset, r);
  r.structure.kinds = ['multilayer-hypergraph'];
  bad(s.dataset, r, 'structure.kinds[0]');
});

test('a bipartite network records its partitions by name', () => {
  const r = clone(PUBLISHED);
  r.structure = {
    kinds: ['graph'], directed: false, weighted: false,
    partitions: { count: 2, names: [{ id: 'film', 'zh-Hant': '影片' }, { id: 'person', 'zh-Hant': '人' }] },
  };
  ok(s.dataset, r);
});

test('a taiwan-subset basis needs a note on how to extract the subset', () => {
  const r = clone(PUBLISHED);
  r.taiwan_relevance.basis = ['taiwan-subset'];
  bad(s.dataset, r, 'taiwan_relevance.subset_note');
});

test('ids are lowercase kebab-case slugs of 3 to 64 characters', () => {
  for (const id of ['Ab', 'ab', 'a_b', 'a--b', '金馬', 'x'.repeat(65), '-ab']) {
    const r = clone(WANTED);
    r.id = id;
    bad(s.dataset, r, 'id');
  }
});

test('a wanted record needs only the wanted-level fields, including a reason', () => {
  const r = clone(WANTED);
  delete r.wanted;
  bad(s.dataset, r, 'wanted');
  const u = clone(WANTED);
  u.wanted.status = 'unavailable';
  bad(s.dataset, u, 'wanted.unavailable_reason');
});

test('unknown fields are rejected', () => {
  const r = clone(PUBLISHED);
  r.node_count = 10;
  bad(s.dataset, r, 'node_count');
});

test('a version written unquoted in YAML (1.10) is caught, because it parses as a number', () => {
  const { data } = parseYamlText('dataset: example-dataset\nversion: 1.10\n');
  assert.equal(data.version, 1.1);
  const m = { ...clone(MANIFEST), version: data.version };
  bad(s.version, m, 'version');
});

test('manifest file URLs live under https://netscied.tw/data/<id>/<version>/', () => {
  const m = clone(MANIFEST);
  m.files[0].url = 'https://data.netscied.tw/example-dataset/1.0.0/x.graphml';
  bad(s.version, m, 'files[0].url');
});

test('person records accept only allowlisted fields and opaque ids', () => {
  const withEmail = { ...clone(PERSON), email: 'someone@example.org' };
  bad(s.person, withEmail, 'email');
  bad(s.person, { ...clone(PERSON), id: 'p0001' }, 'id');
  bad(s.person, { ...clone(PERSON), id: 'p-ILOU1234' }, 'id');
  bad(s.person, { ...clone(PERSON), display: ['orcid'] }, 'display');
});

test('a course needs at least one offering, and every offering evidence and a verification date', () => {
  const none = clone(COURSE);
  none.offerings = [];
  bad(s.course, none, 'offerings');
  const noEvidence = clone(COURSE);
  delete noEvidence.offerings[0].evidence_url;
  bad(s.course, noEvidence, 'offerings[0].evidence_url');
  const noDate = clone(COURSE);
  delete noDate.offerings[0].verified_on;
  bad(s.course, noDate, 'offerings[0].verified_on');
});

test('course terms are <學年度>-<學期>, including summer (S)', () => {
  const c = clone(COURSE);
  c.offerings[0].term = '114-S';
  ok(s.course, c);
  for (const term of ['1141', '114上', '114-3', '2025-1']) {
    c.offerings[0].term = term;
    bad(s.course, c, 'offerings[0].term');
  }
});

test('a non-credit offering uses start and end dates instead of a term', () => {
  const c = clone(COURSE);
  c.offering_type = 'non-credit';
  c.level = 'non-credit';
  c.offerings = [{ instructors: [{ name: '講者' }], evidence_url: 'https://example.org/w', verified_on: '2026-11-04' }];
  bad(s.course, c, 'offerings[0].start');
  c.offerings[0].start = '2025-07-01';
  c.offerings[0].end = '2025-07-05';
  ok(s.course, c);
});

test('news ids are permanent <YYYY-MM-DD>-<slug> anchors', () => {
  bad(s.news, { id: 'scientific-american', date: '2019-03-12', title: { 'zh-Hant': '科學人' } }, 'id');
});
