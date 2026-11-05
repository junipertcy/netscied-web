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
    assert.match(readFileSync(f, 'utf8'), /tcy@inferweave\.com/, path.basename(f));
  }
  const request = parse(readFileSync(path.join(dir, 'request-dataset.yml'), 'utf8'));
  assert.ok(request.body.some((b) => b.id === 'need'), 'the request form has a field with id "need" for the ?need= prefill');
});

test('the PR template has the license, Taiwan-basis and personal-data checklist', () => {
  const t = readFileSync(path.join(repoRoot, '.github', 'pull_request_template.md'), 'utf8');
  for (const s of ['授權證據', '與臺灣的關係', '個人資料審查']) assert.ok(t.includes(s), s);
});

// Review of Milestone A, finding 6: on a push to main, origin/main is the pushed
// commit, so the history checks must compare against the commit before the push.
test('CI validates against the commit before a push, and against the base branch on a pull request', () => {
  const wf = parse(readFileSync(path.join(repoRoot, '.github', 'workflows', 'ci.yml'), 'utf8'));
  const step = wf.jobs.test.steps.find((s) => /validate\.mjs/.test(s.run ?? ''));
  assert.ok(step, 'a validation step');
  const script = `${step.run}\n${JSON.stringify(step.env ?? {})}`;
  assert.match(script, /github\.event\.before/);
  assert.match(script, /github\.base_ref/);
  assert.match(script, /--require-base/);
});

test('task 8.7: the health workflow runs monthly, may only read the repo and write issues, and opens one issue only when there are findings', () => {
  const wf = parse(readFileSync(path.join(repoRoot, '.github', 'workflows', 'health.yml'), 'utf8'));
  assert.ok(wf.on.schedule?.[0]?.cron, 'scheduled');
  assert.deepEqual(wf.permissions, { contents: 'read', issues: 'write' });
  const text = readFileSync(path.join(repoRoot, '.github', 'workflows', 'health.yml'), 'utf8');
  assert.doesNotMatch(text, /aws|id-token|secrets\./i, 'no storage credentials');
  const steps = Object.values(wf.jobs).flatMap((j) => j.steps);
  assert.ok(steps.some((s) => /netscied health/.test(s.run ?? '')));
  const issue = steps.filter((s) => /gh issue create/.test(s.run ?? ''));
  assert.equal(issue.length, 1);
  assert.match(issue[0].if, /findings/);
  assert.doesNotMatch(text, /git push|git commit|gh pr/);
});

test('final review W4: CI cancels superseded runs only on pull requests, never on a push to main', () => {
  const wf = parse(readFileSync(path.join(repoRoot, '.github', 'workflows', 'ci.yml'), 'utf8'));
  // A cancelled push run would let the next push compare against a commit whose
  // manifest edits were never checked (the base is github.event.before).
  assert.equal(wf.concurrency['cancel-in-progress'], "${{ github.event_name == 'pull_request' }}");
});

test('final review W2: the monthly deploy receives the site-check stamp with the build it stamps', () => {
  const wf = parse(readFileSync(path.join(repoRoot, '.github', 'workflows', 'monthly.yml'), 'utf8'));
  const upload = wf.jobs.build.steps.find((s) => /upload-artifact/.test(s.uses ?? ''));
  const paths = String(upload.with.path).split('\n').map((p) => p.trim()).filter(Boolean);
  assert.ok(paths.includes('dist/netscied/browser/') && paths.includes('dist/netscied/site-check.json'), paths.join(' '));
  const download = wf.jobs.deploy.steps.find((s) => /download-artifact/.test(s.uses ?? ''));
  // upload-artifact roots several paths at their common ancestor, dist/netscied/.
  assert.equal(download.with.path, 'dist/netscied/');
  const deployStep = wf.jobs.deploy.steps.findIndex((s) => /scripts\/deploy\.mjs/.test(s.run ?? ''));
  assert.ok(deployStep > wf.jobs.deploy.steps.indexOf(download));
});

// Task 8.6: the gated data-publish job.
test('task 8.6: publish.yml runs only on dispatch, in the approved publish environment, with the least permissions', () => {
  const file = path.join(repoRoot, '.github', 'workflows', 'publish.yml');
  const text = readFileSync(file, 'utf8');
  const wf = parse(text);
  assert.deepEqual(Object.keys(wf.on), ['workflow_dispatch']);
  assert.deepEqual(Object.keys(wf.on.workflow_dispatch.inputs).sort(), ['dataset', 'version']);
  for (const i of Object.values(wf.on.workflow_dispatch.inputs)) assert.equal(i.required, true);
  assert.deepEqual(Object.keys(wf.jobs), ['publish']);
  const job = wf.jobs.publish;
  assert.equal(job.environment, 'publish');
  assert.deepEqual(job.permissions, { contents: 'read', 'id-token': 'write' });
  assert.match(String(wf.permissions ? JSON.stringify(wf.permissions) : '{}'), /^\{\}$|contents/);
  // One run per dataset at a time, never cancelled half-way.
  assert.match(job.concurrency.group, /\$\{\{ inputs\.dataset \}\}/);
  assert.equal(job.concurrency['cancel-in-progress'], false);
  // Inputs reach the shell only through env, never interpolated into a script.
  for (const s of job.steps) assert.doesNotMatch(s.run ?? '', /\$\{\{/, `${s.name}: no \${{ … }} inside run:`);
  // The role ARN is a secret (logs are public); the bucket name is a variable.
  assert.doesNotMatch(text, /vars\.NETSCIED_PUBLISH_ROLE_ARN/);
  const creds = job.steps.find((s) => /aws-actions\/configure-aws-credentials@/.test(s.uses ?? ''));
  assert.equal(creds.with['role-to-assume'], '${{ secrets.NETSCIED_PUBLISH_ROLE_ARN }}');
  assert.equal(creds.with['aws-region'], 'ap-east-2');
  const publish = job.steps.find((s) => /scripts\/data\/publish\.mjs/.test(s.run ?? ''));
  assert.equal(publish.env.NETSCIED_DATA_BUCKET, '${{ vars.NETSCIED_DATA_BUCKET }}');
});

test('task 8.6: publish.yml pins the actions CI uses, checks out full history, and runs fetch → verify → credentials → publish → check', () => {
  const ci = readFileSync(path.join(repoRoot, '.github', 'workflows', 'ci.yml'), 'utf8') + readFileSync(path.join(repoRoot, '.github', 'workflows', 'monthly.yml'), 'utf8');
  const pinned = new Map([...ci.matchAll(/uses:\s*([^@\s]+)@([0-9a-f]{40})/g)].map((m) => [m[1], m[2]]));
  const wf = parse(readFileSync(path.join(repoRoot, '.github', 'workflows', 'publish.yml'), 'utf8'));
  const steps = wf.jobs.publish.steps;
  for (const s of steps.filter((x) => x.uses)) {
    const [name, ref] = s.uses.split('@');
    assert.equal(ref, pinned.get(name), `${name} uses the SHA pinned in ci.yml or monthly.yml`);
  }
  const checkout = steps.find((s) => /actions\/checkout@/.test(s.uses ?? ''));
  assert.equal(checkout.with['fetch-depth'], 0);
  const at = (re) => steps.findIndex((s) => re.test(s.run ?? s.uses ?? ''));
  const order = [/netscied fetch/, /netscied verify/, /configure-aws-credentials/, /scripts\/data\/publish\.mjs/, /sha256sum -c/].map(at);
  assert.ok(order.every((i) => i >= 0), JSON.stringify(order));
  assert.deepEqual([...order].sort((a, b) => a - b), order, `steps out of order: ${order}`);
  assert.match(steps[at(/netscied fetch/)].run, /uv run --frozen netscied fetch "\$DATASET"/);
  assert.match(steps[at(/netscied verify/)].run, /uv run --frozen netscied verify "\$DATASET" "\$VERSION"/);
  // The final check reads the files back from the site and fails clearly on a soft 404.
  const check = steps.at(-1).run;
  assert.ok(steps.at(-1) === steps[at(/sha256sum -c/)]);
  assert.match(check, /https:\/\/netscied\.tw\/data\/\$\{DATASET\}\/\$\{VERSION\}/);
  assert.match(check, /curl /);
  assert.match(check, /text\/html/);
  assert.match(check, /bytes/);
});
