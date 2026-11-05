// Review of Milestone A, finding 5, on the real build: every file in /api/v1/
// that has a response schema validates against it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { browserRoot, readDist } from '../helpers/dist.mjs';

const json = (rel) => JSON.parse(readDist(rel));
const ajv = new Ajv2020({ allErrors: true, strict: true, strictTypes: false, strictRequired: false, allowUnionTypes: true });
addFormats(ajv);
for (const n of readdirSync(path.join(browserRoot, 'api/v1/schema')).filter((f) => f.endsWith('.schema.json'))) ajv.addSchema(json(`api/v1/schema/${n}`));
const check = (schema, data, label) => {
  const v = ajv.getSchema(`https://netscied.tw/api/v1/schema/${schema}`);
  assert.ok(v(data), `${label}: ${JSON.stringify(v.errors?.slice(0, 3))}`);
};

test('the real API validates against its published response schemas', () => {
  check('index.schema.json', json('api/v1/index.json'), 'index');
  for (const d of json('api/v1/datasets.json')) check('dataset-summary.schema.json', d, d.id);
  for (const f of readdirSync(path.join(browserRoot, 'api/v1/datasets'))) check('dataset-record.schema.json', json(`api/v1/datasets/${f}`), f);
  for (const c of json('api/v1/courses.json')) check('course-summary.schema.json', c, c.id);
  for (const f of readdirSync(path.join(browserRoot, 'api/v1/courses'))) check('course-record.schema.json', json(`api/v1/courses/${f}`), f);
  for (const w of json('api/v1/wanted.json')) check('wanted-entry.schema.json', w, w.id);
  for (const n of json('api/v1/news.json')) check('news-item.schema.json', n, n.id);
});

test('every API file is listed in the index with its stability, and catalog.json is internal', () => {
  const files = json('api/v1/index.json').files;
  assert.equal(files.find((f) => f.path === '/api/v1/catalog.json').stability, 'internal');
  for (const f of files.filter((x) => x.schema)) assert.ok(f.schema.startsWith('https://netscied.tw/api/v1/schema/'), f.path);
});
