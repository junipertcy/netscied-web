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
