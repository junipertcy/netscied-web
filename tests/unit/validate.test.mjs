// Task 3.4 — scripts/catalog/validate.mjs. The base fixture is a valid catalog;
// every rule has a failing variant, and the CLI must exit non-zero on each and
// name the file and the field.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, stringify } from 'yaml';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const base = path.join(repoRoot, 'tests', 'fixtures', 'catalog-base');
const cli = path.join(repoRoot, 'scripts', 'catalog', 'validate.mjs');

function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), 'catalog-'));
  cpSync(base, dir, { recursive: true });
  return dir;
}

function editYaml(dir, rel, fn) {
  const file = path.join(dir, rel);
  const data = parse(readFileSync(file, 'utf8'));
  fn(data);
  writeFileSync(file, stringify(data));
}

function editJson(dir, rel, fn) {
  const file = path.join(dir, rel);
  const data = JSON.parse(readFileSync(file, 'utf8'));
  fn(data);
  writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}

function run(dir, extra = []) {
  const res = spawnSync(process.execPath, [cli, '--root', dir, '--base-ref', 'none', '--today', '2026-11-04', ...extra], { encoding: 'utf8' });
  return { code: res.status, out: res.stdout + res.stderr };
}

function expectFailure(mutate, ...needles) {
  const dir = fixture();
  try {
    mutate(dir);
    const { code, out } = run(dir);
    assert.notEqual(code, 0, `expected validation to fail:\n${out}`);
    for (const n of needles) assert.ok(out.includes(n), `expected output to mention ${JSON.stringify(n)}:\n${out}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const D = (id) => `catalog/datasets/${id}.yaml`;

test('the base fixture is a valid catalog', () => {
  const dir = fixture();
  try {
    const { code, out } = run(dir);
    assert.equal(code, 0, out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('missing recommended fields warn but pass (minimal published record)', () => {
  const dir = fixture();
  try {
    editYaml(dir, D('link-only-graph'), (r) => {
      delete r.keywords;
      delete r.coverage;
      delete r.creators;
      delete r.references;
      delete r.description.en;
      delete r.counts;
      delete r.provenance.access;
      delete r.license.evidence;
    });
    const { code, out } = run(dir);
    assert.equal(code, 0, out);
    assert.match(out, /warning: .*link-only-graph\.yaml: keywords: recommended field missing/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('schema: a missing Taiwan-relevance basis names the file and the field', () => {
  expectFailure((d) => editYaml(d, D('hosted-graph'), (r) => delete r.taiwan_relevance), 'hosted-graph.yaml', 'taiwan_relevance');
});

test('vocabulary: an unknown domain names the file and the field', () => {
  expectFailure((d) => editYaml(d, D('hosted-graph'), (r) => (r.domains = ['infrastructure'])), 'hosted-graph.yaml', 'domains[0]', 'infrastructure');
});

test('vocabulary: an unknown tag fails', () => {
  expectFailure((d) => editYaml(d, D('hosted-graph'), (r) => (r.tags = ['nope'])), 'hosted-graph.yaml', 'tags[0]');
});

test('the file name must equal the id', () => {
  expectFailure((d) => editYaml(d, D('hosted-graph'), (r) => (r.id = 'other-name')), 'hosted-graph.yaml', 'id');
});

test('ids and aliases are unique across records', () => {
  expectFailure((d) => editYaml(d, D('link-only-graph'), (r) => (r.aliases = ['hosted-graph'])), 'link-only-graph.yaml', 'aliases', 'hosted-graph');
});

test('every id must be in ids.lock', () => {
  expectFailure((d) => {
    const f = path.join(d, 'catalog', 'ids.lock');
    writeFileSync(f, readFileSync(f, 'utf8').replace('dataset wanted-thing 2026-11-03\n', ''));
  }, 'wanted-thing', 'ids.lock');
});

test('ids.lock blocks reuse of an identifier with a different added date', () => {
  expectFailure((d) => {
    unlinkSync(path.join(d, D('withdrawn-thing')));
    const fresh = parse(readFileSync(path.join(d, D('wanted-thing')), 'utf8'));
    fresh.id = 'withdrawn-thing';
    fresh.added = '2026-11-04';
    writeFileSync(path.join(d, D('withdrawn-thing')), stringify(fresh));
  }, 'withdrawn-thing', 'ids.lock', 'reused');
});

test('a locked id may not lose its record', () => {
  expectFailure((d) => unlinkSync(path.join(d, D('withdrawn-thing'))), 'withdrawn-thing', 'ids.lock');
});

test('a license must be in the pinned SPDX list', () => {
  expectFailure((d) => editYaml(d, D('hosted-graph'), (r) => (r.license.id = 'CC-BY-3.0-TW')), 'hosted-graph.yaml', 'license.id', 'SPDX');
});

test('a license must have a class in catalog/vocab/licenses.yaml', () => {
  expectFailure((d) => editYaml(d, D('hosted-graph'), (r) => (r.license.id = 'MIT')), 'hosted-graph.yaml', 'license.id', 'unknown license');
});

test('own-work records are released under CC BY 4.0 (or CC0)', () => {
  expectFailure((d) => editYaml(d, D('hosted-graph'), (r) => {
    r.redistribution.basis = 'own-work';
    r.license.id = 'ODbL-1.0';
  }), 'hosted-graph.yaml', 'license.id', 'own-work');
});

test('person references must resolve to catalog/people', () => {
  expectFailure((d) => unlinkSync(path.join(d, 'catalog', 'people', 'p-7K3M9QX2.yaml')), 'hosted-graph.yaml', 'creators[0].person', 'p-7K3M9QX2');
});

test('a link-only record may not have hosted versions', () => {
  expectFailure((d) => editYaml(d, D('hosted-graph'), (r) => {
    r.redistribution.basis = 'link-only';
  }), 'hosted-graph.yaml', 'redistribution.basis', 'link-only');
});

test('a hosted record may not carry hand-typed counts', () => {
  expectFailure((d) => editYaml(d, D('hosted-graph'), (r) => (r.counts = { nodes: 3 })), 'hosted-graph.yaml', 'counts', 'version manifest');
});

test('a wanted record may not have hosted versions', () => {
  expectFailure((d) => {
    mkdirSync(path.join(d, 'catalog', 'versions', 'wanted-thing'));
    const m = JSON.parse(readFileSync(path.join(d, 'catalog', 'versions', 'hosted-graph', '1.0.0.json'), 'utf8'));
    m.dataset = 'wanted-thing';
    m.files[0].url = m.files[0].url.replace('hosted-graph', 'wanted-thing');
    writeFileSync(path.join(d, 'catalog', 'versions', 'wanted-thing', '1.0.0.json'), JSON.stringify(m));
  }, 'wanted-thing', 'wanted');
});

test('a withdrawn record may not keep live files', () => {
  expectFailure((d) => editYaml(d, D('hosted-graph'), (r) => {
    r.status = 'withdrawn';
    r.withdrawn = { date: '2026-11-04', reason: { 'zh-Hant': '測試' } };
  }), 'hosted-graph', 'withdrawn');
});

test('personal data: private-individuals cannot be hosted', () => {
  expectFailure((d) => editYaml(d, D('hosted-graph'), (r) => (r.personal_data.level = 'private-individuals')), 'hosted-graph.yaml', 'personal_data.level', 'private-individuals');
});

test('personal data: a sensitive record links only to a controlled-access gate', () => {
  expectFailure((d) => editYaml(d, D('link-only-graph'), (r) => (r.personal_data.level = 'sensitive')), 'link-only-graph.yaml', 'provenance.access[0]', 'controlled-access');
});

test('personal data: the review date cannot be in the future', () => {
  expectFailure((d) => editYaml(d, D('link-only-graph'), (r) => (r.personal_data.reviewed_on = '2027-01-01')), 'link-only-graph.yaml', 'personal_data.reviewed_on');
});

test('PII scan: an email address in a record fails, the site address does not', () => {
  expectFailure((d) => editYaml(d, D('link-only-graph'), (r) => (r.description['zh-Hant'] += '聯絡 someone@example.org')), 'link-only-graph.yaml', 'description.zh-Hant', 'email');
});

test('PII scan: a Taiwanese phone number fails and names the file', () => {
  expectFailure((d) => editYaml(d, D('link-only-graph'), (r) => (r.description['zh-Hant'] += '電話 0912-345-678')), 'link-only-graph.yaml', 'phone');
});

test('PII scan: news bodies are scanned too', () => {
  expectFailure((d) => {
    const f = path.join(d, 'content', 'news', '2026-11-04-relaunch.md');
    writeFileSync(f, readFileSync(f, 'utf8') + '\n或撥 (02) 2345-6789。\n');
  }, '2026-11-04-relaunch.md', 'phone');
});

test('a course needs a known university', () => {
  expectFailure((d) => editYaml(d, 'catalog/courses/test-graph-theory.yaml', (r) => (r.university = 'harvard')), 'test-graph-theory.yaml', 'university');
});

test('a course offering without evidence names the course and the offering', () => {
  expectFailure((d) => editYaml(d, 'catalog/courses/test-graph-theory.yaml', (r) => delete r.offerings[0].evidence_url), 'test-graph-theory.yaml', 'offerings[0].evidence_url', '114-1');
});

test('news: unknown related ids fail', () => {
  expectFailure((d) => {
    const f = path.join(d, 'content', 'news', '2026-11-04-relaunch.md');
    writeFileSync(f, readFileSync(f, 'utf8').replace('datasets: [hosted-graph]', 'datasets: [no-such-dataset]'));
  }, '2026-11-04-relaunch.md', 'related.datasets[0]');
});

test('news: duplicate anchors fail', () => {
  expectFailure((d) => {
    const src = path.join(d, 'content', 'news', '2026-11-04-relaunch.md');
    writeFileSync(path.join(d, 'content', 'news', 'copy.md'), readFileSync(src, 'utf8'));
  }, '2026-11-04-relaunch', 'duplicate');
});

test('news: the anchor must start with the item date', () => {
  expectFailure((d) => {
    const f = path.join(d, 'content', 'news', '2026-11-04-relaunch.md');
    writeFileSync(f, readFileSync(f, 'utf8').replace('date: 2026-11-04', 'date: 2026-11-05'));
  }, '2026-11-04-relaunch.md', 'id');
});

test('manifests: the path must match the dataset and version', () => {
  expectFailure((d) => editJson(d, 'catalog/versions/hosted-graph/1.0.0.json', (m) => (m.version = '1.0.1')), '1.0.0.json', 'version');
});

test('manifests: file URLs must sit under the version folder', () => {
  expectFailure((d) => editJson(d, 'catalog/versions/hosted-graph/1.0.0.json', (m) => (m.files[0].url = 'https://netscied.tw/data/hosted-graph/2.0.0/x.graphml')), '1.0.0.json', 'files[0].url');
});

// The rules that compare against the base branch need a git history.
function gitFixture() {
  const dir = fixture();
  const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' });
  git('init', '-q', '-b', 'main');
  git('-c', 'user.name=t', '-c', 'user.email=t@example.org', 'add', '.');
  git('-c', 'user.name=t', '-c', 'user.email=t@example.org', 'commit', '-q', '-m', 'base');
  return dir;
}

test('manifests are immutable against the base branch', () => {
  const dir = gitFixture();
  try {
    editJson(dir, 'catalog/versions/hosted-graph/1.0.0.json', (m) => (m.files[0].bytes = 999));
    const { code, out } = run(dir, ['--base-ref', 'main']);
    assert.notEqual(code, 0, out);
    assert.match(out, /1\.0\.0\.json/);
    assert.match(out, /immutable/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('manifests may gain a DOI, a suspension or a withdrawal after publication', () => {
  const dir = gitFixture();
  try {
    editJson(dir, 'catalog/versions/hosted-graph/1.0.0.json', (m) => {
      m.doi = '10.5281/zenodo.1234567';
      m.suspended = true;
    });
    const { code, out } = run(dir, ['--base-ref', 'main']);
    assert.equal(code, 0, out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a published manifest may not be deleted', () => {
  const dir = gitFixture();
  try {
    unlinkSync(path.join(dir, 'catalog', 'versions', 'hosted-graph', '1.0.0.json'));
    const { code, out } = run(dir, ['--base-ref', 'main']);
    assert.notEqual(code, 0, out);
    assert.match(out, /1\.0\.0\.json/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('ids.lock is append-only against the base branch', () => {
  const dir = gitFixture();
  try {
    const f = path.join(dir, 'catalog', 'ids.lock');
    writeFileSync(f, readFileSync(f, 'utf8').replace('dataset withdrawn-thing 2026-10-01\n', '') + 'dataset withdrawn-thing 2026-10-01\n');
    const { code, out } = run(dir, ['--base-ref', 'main']);
    assert.notEqual(code, 0, out);
    assert.match(out, /ids\.lock/);
    assert.match(out, /append-only/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a missing base branch is an error only when --require-base is set', () => {
  const dir = fixture();
  try {
    const soft = run(dir, ['--base-ref', 'origin/main']);
    assert.equal(soft.code, 0, soft.out);
    assert.match(soft.out, /warning: .*origin\/main/);
    const hard = run(dir, ['--base-ref', 'origin/main', '--require-base']);
    assert.notEqual(hard.code, 0, hard.out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the real catalog validates', () => {
  const res = spawnSync(process.execPath, [cli], { cwd: repoRoot, encoding: 'utf8' });
  assert.equal(res.status, 0, res.stdout + res.stderr);
});

test('the rejected-course list is validated, with known universities', () => {
  expectFailure((d) => writeFileSync(path.join(d, 'catalog', 'courses-rejected.yaml'), '- { title: 計算機網路, university: nowhere, reason: 電腦網路, url: "https://example.org/x", checked_on: 2026-11-04 }\n'), 'courses-rejected.yaml', '[0].university');
  expectFailure((d) => writeFileSync(path.join(d, 'catalog', 'courses-rejected.yaml'), '- { title: 計算機網路, university: ntu, url: "https://example.org/x", checked_on: 2026-11-04 }\n'), 'courses-rejected.yaml', '[0].reason');
});

test('the international list is validated: an archived entry needs its archive URL', () => {
  expectFailure((d) => writeFileSync(path.join(d, 'catalog', 'international.yaml'), '- { title: { en: Network Theory }, institution: UMich, url: "https://example.org/x", kind: course, checked_on: 2026-11-04, archived: true }\n'), 'international.yaml', '[0].archive_url');
});

// Review of Milestone A, finding 8: every URL in a sensitive record, not only the
// access links, must be its controlled-access gate.
function sensitiveGate(r) {
  r.personal_data.level = 'sensitive';
  r.provenance.access = [{ label: { 'zh-Hant': '申請使用' }, url: 'https://example.org/apply', controlled_access: true }];
  r.provenance.source.url = 'https://example.org/apply';
  r.license.evidence.url = 'https://example.org/apply';
}

test('review 8: a sensitive record whose every URL is the access gate is valid', () => {
  const dir = fixture();
  try {
    editYaml(dir, D('link-only-graph'), sensitiveGate);
    const { code, out } = run(dir);
    assert.equal(code, 0, out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('review 8: a sensitive record may not point at raw data through its source or references', () => {
  expectFailure((d) => editYaml(d, D('link-only-graph'), (r) => {
    sensitiveGate(r);
    r.provenance.source.url = 'https://example.org/raw/dump.csv';
  }), 'link-only-graph.yaml', 'provenance.source.url', 'controlled-access');
  expectFailure((d) => editYaml(d, D('link-only-graph'), (r) => {
    sensitiveGate(r);
    r.references = [{ citation: '某作者（2026）。某研究。某期刊。', url: 'https://example.org/raw/edges.csv' }];
  }), 'link-only-graph.yaml', 'references[0].url', 'controlled-access');
});

// Review of Milestone A, finding 10: a manual source is committed and verified
// against its recorded SHA-256 and size; automated jobs never re-fetch it.
function withRecipe(d, csv, expected) {
  mkdirSync(path.join(d, 'curation', 'recipes'), { recursive: true });
  mkdirSync(path.join(d, 'curation', 'inputs', 'hosted-graph'), { recursive: true });
  if (csv !== null) writeFileSync(path.join(d, 'curation', 'inputs', 'hosted-graph', 'data.csv'), csv);
  writeFileSync(path.join(d, 'curation', 'recipes', 'hosted-graph.yaml'), stringify({
    dataset: 'hosted-graph',
    version: '1.0.0',
    sources: [{ id: 'manual-copy', method: 'manual', steps: { 'zh-Hant': '手動下載。' }, file: 'hosted-graph/data.csv', landing_page: 'https://example.org/source', expected, retrieved_at: '2026-11-01', license_evidence: { url: 'https://example.org/license', checked_on: '2026-11-01' } }],
    convert: { converter: 'test', kind: 'graph' },
  }));
}

test('review 10: a manual source file must match its recorded SHA-256 and size', () => {
  const good = { sha256: 'b5bb9d8014a0f9b1d61e21e796d78dccdf1352f23cd32812f4850b878ae4944c', bytes: 4 };
  const dir = fixture();
  try {
    withRecipe(dir, 'foo\n', good);
    const { code, out } = run(dir);
    assert.equal(code, 0, out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  expectFailure((d) => withRecipe(d, 'bar\n', good), 'hosted-graph.yaml', 'sources[0]', 'SHA-256');
  expectFailure((d) => withRecipe(d, null, good), 'hosted-graph.yaml', 'sources[0].file', 'missing');
});
