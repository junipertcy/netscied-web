// Review of Milestone A, finding 5: the JSON Schemas published under
// /api/v1/schema/ describe the API responses agents receive, every shared field
// has one shape in summaries and full records, and the source-record schemas are
// published separately, labelled as such.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { parse, stringify } from 'yaml';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const fixture = path.join(repoRoot, 'tests', 'fixtures', 'catalog-base');
let root;
let out;
let ajv;
const json = (rel) => JSON.parse(readFileSync(path.join(out, rel), 'utf8'));
const BASE = 'https://netscied.tw/api/v1/schema/';

before(() => {
  root = mkdtempSync(path.join(tmpdir(), 'cat-'));
  out = mkdtempSync(path.join(tmpdir(), 'site-'));
  cpSync(fixture, root, { recursive: true });
  // A renamed id, so the renamed stub is covered too.
  const f = path.join(root, 'catalog', 'datasets', 'link-only-graph.yaml');
  const r = parse(readFileSync(f, 'utf8'));
  r.aliases = ['old-link-graph'];
  writeFileSync(f, stringify(r));
  writeFileSync(path.join(root, 'catalog', 'ids.lock'), readFileSync(path.join(root, 'catalog', 'ids.lock'), 'utf8') + 'dataset old-link-graph 2026-11-02\n');
  const res = spawnSync(process.execPath, [path.join(repoRoot, 'scripts', 'catalog', 'build.mjs'), '--root', root, '--out', out, '--today', '2026-11-04', '--no-git'], { encoding: 'utf8' });
  assert.equal(res.status, 0, res.stdout + res.stderr);
  ajv = new Ajv2020({ allErrors: true, strict: true, strictTypes: false, strictRequired: false, allowUnionTypes: true });
  addFormats(ajv);
  for (const dir of ['api/v1/schema', 'api/v1/schema/source']) {
    for (const name of readdirSync(path.join(out, dir)).filter((n) => n.endsWith('.schema.json'))) ajv.addSchema(json(`${dir}/${name}`));
  }
});

after(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(out, { recursive: true, force: true });
});

function valid(schema, data, label) {
  const v = ajv.getSchema(BASE + schema);
  assert.ok(v, `schema ${schema} is published`);
  assert.ok(v(data), `${label}: ${JSON.stringify(v.errors?.slice(0, 3))}`);
}

test('the response schemas are published at /api/v1/schema/, the source schemas under /api/v1/schema/source/', () => {
  for (const name of ['dataset-record', 'dataset-summary', 'course-record', 'course-summary', 'wanted-entry', 'news-item', 'index', 'api-common']) {
    assert.ok(readdirSync(path.join(out, 'api/v1/schema')).includes(`${name}.schema.json`), name);
  }
  for (const name of ['dataset', 'version', 'course', 'person', 'news', 'recipe', 'common', 'vocab']) {
    const s = json(`api/v1/schema/source/${name}.schema.json`);
    assert.equal(s.$id, `${BASE}source/${name}.schema.json`);
    assert.match(s.title, /source/i, `${name} is labelled as a source-record schema`);
  }
});

test('every full dataset record validates: published, withdrawn and renamed', () => {
  for (const f of readdirSync(path.join(out, 'api/v1/datasets'))) valid('dataset-record.schema.json', json(`api/v1/datasets/${f}`), f);
  assert.equal(json('api/v1/datasets/old-link-graph.json').status, 'renamed');
});

test('a full record with a wrong shape is rejected (the schemas are not trivially permissive)', () => {
  const r = json('api/v1/datasets/hosted-graph.json');
  r.redistribution = 'license-permits';
  const v = ajv.getSchema(BASE + 'dataset-record.schema.json');
  assert.equal(v(r), false);
  const unknown = { ...json('api/v1/datasets/hosted-graph.json'), surprise: 1 };
  assert.equal(v(unknown), false);
});

test('summaries, courses, wanted entries, news and the index validate', () => {
  for (const d of json('api/v1/datasets.json')) valid('dataset-summary.schema.json', d, d.id);
  for (const f of readdirSync(path.join(out, 'api/v1/courses'))) valid('course-record.schema.json', json(`api/v1/courses/${f}`), f);
  for (const c of json('api/v1/courses.json')) valid('course-summary.schema.json', c, c.id);
  for (const w of json('api/v1/wanted.json')) valid('wanted-entry.schema.json', w, w.id);
  for (const n of json('api/v1/news.json')) valid('news-item.schema.json', n, n.id);
  valid('index.schema.json', json('api/v1/index.json'), 'index.json');
});

test('a shared field has one shape in summaries and full records', () => {
  const full = json('api/v1/datasets/hosted-graph.json');
  const summary = json('api/v1/datasets.json').find((d) => d.id === 'hosted-graph');
  for (const k of ['redistribution', 'personal_data', 'license', 'latest_version', 'size']) {
    assert.equal(typeof summary[k], typeof full[k], k);
    for (const sub of Object.keys(summary[k] ?? {})) assert.deepEqual(summary[k][sub], full[k][sub], `${k}.${sub}`);
  }
  const c = json('api/v1/courses.json')[0];
  const cf = json(`api/v1/courses/${c.id}.json`);
  for (const k of ['relevance', 'category', 'level', 'university', 'latest', 'freshness']) assert.deepEqual(c[k], cf[k], k);
});

test('catalog.json is marked internal in the index, not part of the v1 contract', () => {
  const entry = json('api/v1/index.json').files.find((f) => f.path === '/api/v1/catalog.json');
  assert.equal(entry.stability, 'internal');
  assert.ok(json('api/v1/index.json').files.filter((f) => f.path !== '/api/v1/catalog.json').every((f) => f.stability === 'stable'));
});

test('final review W7: every file the index lists validates against the schema the index names for it', () => {
  const index = json('api/v1/index.json');
  const named = index.files.filter((f) => f.schema);
  assert.ok(named.some((f) => f.path === '/api/v1/datasets.json'));
  for (const f of named) {
    const v = ajv.getSchema(f.schema);
    assert.ok(v, `${f.path}: schema ${f.schema} is published`);
    assert.ok(v(json(f.path.slice(1))), `${f.path} against ${f.schema}: ${JSON.stringify(v.errors?.slice(0, 2))}`);
  }
  valid('index.schema.json', index, 'index.json');
});

test('final review W7: the content type the index declares for each file is the one the deploy uploads it with', async () => {
  const { classify } = await import('../../scripts/deploy.mjs');
  for (const f of json('api/v1/index.json').files) {
    const uploaded = classify(f.path.slice(1)).contentType?.split(';')[0].trim();
    assert.equal(uploaded, f.media_type, f.path);
  }
});
