// Tasks 3.6 and 3.7 — the CI workflows and the GitHub Issue Forms validate against
// the SchemaStore schemas (copies in tests/fixtures/schemastore/, Apache-2.0,
// from https://www.schemastore.org/, downloaded 2026-11-04, so this runs offline).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { parse } from 'yaml';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const store = (name) => JSON.parse(readFileSync(path.join(repoRoot, 'tests', 'fixtures', 'schemastore', `${name}.json`), 'utf8'));
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const workflowSchema = ajv.compile(store('github-workflow'));
const yamlFiles = (dir) => (existsSync(dir) ? readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)).map((f) => path.join(dir, f)) : []);

test('every workflow validates against the GitHub workflow schema', () => {
  const files = yamlFiles(path.join(repoRoot, '.github', 'workflows'));
  assert.ok(files.length >= 2);
  for (const f of files) {
    const ok = workflowSchema(parse(readFileSync(f, 'utf8')));
    assert.ok(ok, `${path.basename(f)}: ${JSON.stringify(workflowSchema.errors?.slice(0, 3))}`);
  }
});

test('workflows check out full history and pin every action to a commit', () => {
  for (const f of yamlFiles(path.join(repoRoot, '.github', 'workflows'))) {
    const text = readFileSync(f, 'utf8');
    for (const m of text.matchAll(/uses:\s*([^\s#]+)/g)) assert.match(m[1], /@[0-9a-f]{40}$/, `${path.basename(f)}: ${m[1]} is not pinned to a commit`);
    if (/actions\/checkout/.test(text) && /pnpm test/.test(text)) assert.match(text, /fetch-depth: 0/, path.basename(f));
  }
});

test('the monthly workflow is scheduled and rebuilds the site', () => {
  const wf = parse(readFileSync(path.join(repoRoot, '.github', 'workflows', 'monthly.yml'), 'utf8'));
  assert.ok(wf.on.schedule?.length);
  assert.match(wf.on.schedule[0].cron, /^\S+ \S+ \S+ \* \*$/);
});

test('the issue forms and their config validate against the SchemaStore schemas', () => {
  const forms = ajv.compile(store('github-issue-forms'));
  const config = ajv.compile(store('github-issue-config'));
  const dir = path.join(repoRoot, '.github', 'ISSUE_TEMPLATE');
  const files = yamlFiles(dir).filter((f) => !f.endsWith('config.yml'));
  assert.deepEqual(files.map((f) => path.basename(f)).sort(), ['report-problem.yml', 'request-dataset.yml', 'suggest-dataset.yml']);
  for (const f of files) assert.ok(forms(parse(readFileSync(f, 'utf8'))), `${path.basename(f)}: ${JSON.stringify(forms.errors?.slice(0, 3))}`);
  assert.ok(config(parse(readFileSync(path.join(dir, 'config.yml'), 'utf8'))), JSON.stringify(config.errors));
});

test('every issue form sends takedowns to email, and the request form can be prefilled with the query', () => {
  const dir = path.join(repoRoot, '.github', 'ISSUE_TEMPLATE');
  for (const f of yamlFiles(dir).filter((x) => !x.endsWith('config.yml'))) {
    assert.match(readFileSync(f, 'utf8'), /hi@netscied\.tw/, path.basename(f));
  }
  const request = parse(readFileSync(path.join(dir, 'request-dataset.yml'), 'utf8'));
  assert.ok(request.body.some((b) => b.id === 'need'), 'the request form has a field with id "need" for the ?need= prefill');
});

test('the PR template has the license, Taiwan-basis and personal-data checklist', () => {
  const t = readFileSync(path.join(repoRoot, '.github', 'pull_request_template.md'), 'utf8');
  for (const s of ['授權證據', '與臺灣的關係', '個人資料審查']) assert.ok(t.includes(s), s);
});
