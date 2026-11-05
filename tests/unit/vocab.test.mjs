// Task 3.3 — the vocabularies validate, and they cover every controlled value
// the schemas allow, so no badge, filter or JSON-LD label is ever missing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { loadVocab } from '../../scripts/catalog/lib/vocab.mjs';
import { repoRoot } from '../../scripts/catalog/lib/schemas.mjs';

const { vocab, errors } = loadVocab(path.join(repoRoot, 'catalog', 'vocab'));
const schema = (name) => JSON.parse(readFileSync(path.join(repoRoot, 'schemas', 'v1', `${name}.schema.json`), 'utf8'));
const dataset = schema('dataset');
const course = schema('course');
const keys = (o) => Object.keys(o).sort();

test('every vocabulary file validates against vocab.schema.json', () => {
  assert.deepEqual(errors, []);
});

test('there are exactly the nine bilingual domains of the spec', () => {
  assert.deepEqual(vocab.domains.map((d) => d.id), ['society', 'politics', 'culture', 'economy', 'transport', 'technology', 'information', 'life', 'health']);
  assert.deepEqual(vocab.domains.map((d) => d['zh-Hant']), ['社會關係', '政治與治理', '文化、媒體與運動', '經濟與產業', '交通與移動', '科技與基礎設施', '資訊與知識', '生物與生態', '健康與醫療']);
});

test('every enum in the dataset and course schemas has a Mandarin and English label', () => {
  const st = dataset.$defs.structure.properties;
  const pairs = [
    ['kinds', st.kinds.items.enum],
    ['layers', st.layers.enum],
    ['temporal', st.temporal.properties.form.enum],
    ['spatial', st.spatial.properties.form.enum],
    ['ranking_data_type', st.ranking.properties.data_type.enum],
    ['comparison_outcome', st.comparison.properties.outcome.enum],
    ['taiwan_relevance', dataset.properties.taiwan_relevance.properties.basis.items.enum],
    ['personal_data', dataset.properties.personal_data.properties.level.enum],
    ['redistribution', dataset.properties.redistribution.properties.basis.enum],
    ['course_category', course.properties.category.enum],
    ['relevance', course.properties.relevance.enum],
    ['offering_type', course.properties.offering_type.enum],
    ['level', course.properties.level.enum],
    ['language', course.properties.languages.items.enum],
  ];
  for (const [group, values] of pairs) {
    assert.deepEqual(keys(vocab.labels[group] ?? {}), [...values].sort(), `labels.yaml ${group}`);
  }
  const wanted = [...dataset.properties.wanted.properties.status.enum, 'published'].sort();
  assert.deepEqual(keys(vocab.labels.wanted_status), wanted);
});

test('every license has a class, and SPDX ids are in the pinned list', () => {
  assert.equal(vocab.spdx.licenseListVersion, '3.29.0');
  for (const lic of vocab.licenses) {
    assert.ok(vocab.labels.license_class[lic.class], `${lic.id}: class ${lic.class} has no label`);
  }
  assert.equal(vocab.byId.licenses.get('OGDL-Taiwan-1.0').class, 'permissive');
  assert.equal(vocab.byId.licenses.get('ODbL-1.0').class, 'share-alike');
  assert.equal(vocab.byId.licenses.get('NOASSERTION').class, 'link-only');
});

test('every concept attaches to something that exists', () => {
  const kinds = new Set(dataset.$defs.structure.properties.kinds.items.enum);
  const categories = new Set(course.properties.category.enum);
  const ids = new Set();
  for (const c of vocab.concepts.concepts) {
    assert.ok(!ids.has(c.id), `duplicate concept ${c.id}`);
    ids.add(c.id);
    const a = c.attach ?? {};
    if (a.kind) assert.ok(kinds.has(a.kind), `${c.id}: unknown kind ${a.kind}`);
    if (a.domain) assert.ok(vocab.byId.domains.has(a.domain), `${c.id}: unknown domain ${a.domain}`);
    if (a.tag) assert.ok(vocab.byId.tags.has(a.tag), `${c.id}: unknown tag ${a.tag}`);
    if (a.category) assert.ok(categories.has(a.category), `${c.id}: unknown category ${a.category}`);
  }
  for (const d of vocab.domains) assert.ok(ids.has(`domain:${d.id}`), `domain ${d.id} has no search concept`);
  for (const k of kinds) assert.ok(ids.has(`kind:${k}`), `kind ${k} has no search concept`);
  for (const cat of categories) assert.ok(ids.has(`category:${cat}`), `category ${cat} has no search concept`);
});

test('ids.lock parses as <kind> <id> <date> lines', () => {
  const lines = readFileSync(path.join(repoRoot, 'catalog', 'ids.lock'), 'utf8').split('\n').filter((l) => l.trim() && !l.startsWith('#'));
  assert.ok(lines.length > 0);
  for (const line of lines) assert.match(line, /^(dataset|course) [a-z0-9]+(?:-[a-z0-9]+)* \d{4}-\d{2}-\d{2}$|^alias [a-z0-9-]+ [a-z0-9-]+$/);
});
