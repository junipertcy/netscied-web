// Task 8.6 — scripts/data/publish.mjs uploads one verified version from
// build/data/<id>/<version>/ to s3://$NETSCIED_DATA_BUCKET/data/<id>/<version>/
// (data-curation spec, "Human gate on publication"; site-hosting spec, cache policy).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { contentHeaders, planPublish, runPublish, validateTarget } from '../../scripts/data/publish.mjs';
import { repoRoot } from '../helpers/dist.mjs';

const IMMUTABLE = 'public, max-age=31536000, immutable';
const cli = path.join(repoRoot, 'scripts', 'data', 'publish.mjs');
const sha = (b) => createHash('sha256').update(b).digest('hex');
const b64 = (hex) => Buffer.from(hex, 'hex').toString('base64');

// A version folder and its manifest, as netscied verify leaves them.
function fixture(extra = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'publish-'));
  const id = 'test-graph';
  const version = '1.0.0';
  const folder = path.join(root, 'data', id, version);
  const contents = {
    'test-graph-1.0.0.zip': Buffer.from('PK zip'),
    'test-graph-1.0.0.graphml': '<graphml/>\n',
    'nodes.csv': 'index,id\n0,a\n',
    'edges.csv': 'id,source,target\n',
    'datapackage.json': '{}\n',
    'original/raw.csv': 'a,b\n',
    'ATTRIBUTION.txt': '測試\n',
    'provenance.json': '{"x":1}\n',
    ...extra,
  };
  const files = [];
  for (const [rel, body] of Object.entries(contents)) {
    mkdirSync(path.dirname(path.join(folder, rel)), { recursive: true });
    writeFileSync(path.join(folder, rel), body);
    files.push({ path: rel, sha256: sha(Buffer.from(body)), bytes: Buffer.byteLength(body) });
  }
  const sums = files.map((f) => `${f.sha256}  ${f.path}\n`).sort().join('');
  writeFileSync(path.join(folder, 'SHA256SUMS'), sums);
  files.push({ path: 'SHA256SUMS', sha256: sha(Buffer.from(sums)), bytes: Buffer.byteLength(sums) });
  const manifest = { dataset: id, version, files: files.map((f) => ({ ...f, url: `https://netscied.tw/data/${id}/${version}/${f.path}` })) };
  mkdirSync(path.join(root, 'catalog', 'versions', id), { recursive: true });
  writeFileSync(path.join(root, 'catalog', 'versions', id, `${version}.json`), JSON.stringify(manifest));
  return { root, id, version, folder, manifest, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test('ids and versions are validated before any command is built', () => {
  for (const [id, version] of [['../etc', '1.0.0'], ['Test', '1.0.0'], ['-x', '1.0.0'], ['a b', '1.0.0'], ['ok', '1.0'], ['ok', '01.0.0'], ['ok', '1.0.0;rm']]) {
    assert.throws(() => validateTarget(id, version), /id|version/, `${id} ${version}`);
  }
  assert.doesNotThrow(() => validateTarget('taipei-metro-od-monthly', '1.0.0'));
  const res = spawnSync(process.execPath, [cli, '../etc', '1.0.0', '--dry-run'], { encoding: 'utf8', env: { ...process.env, NETSCIED_DATA_BUCKET: 'netscied-data' } });
  assert.notEqual(res.status, 0);
  assert.doesNotMatch(res.stdout, /aws|s3api/);
});

test('content types by extension: data files download, SHA256SUMS, ATTRIBUTION.txt and provenance.json show inline', () => {
  assert.deepEqual(contentHeaders('SHA256SUMS'), { contentType: 'text/plain; charset=utf-8', disposition: null });
  assert.deepEqual(contentHeaders('ATTRIBUTION.txt'), { contentType: 'text/plain; charset=utf-8', disposition: null });
  assert.deepEqual(contentHeaders('provenance.json'), { contentType: 'application/json; charset=utf-8', disposition: null });
  assert.deepEqual(contentHeaders('edges.csv'), { contentType: 'text/csv; charset=utf-8', disposition: 'attachment' });
  assert.deepEqual(contentHeaders('x-1.0.0.graphml'), { contentType: 'application/graphml+xml; charset=utf-8', disposition: 'attachment' });
  assert.deepEqual(contentHeaders('x-1.0.0.hif.json'), { contentType: 'application/json; charset=utf-8', disposition: 'attachment' });
  assert.deepEqual(contentHeaders('original/bills/page-0001.json'), { contentType: 'application/json; charset=utf-8', disposition: 'attachment' });
  assert.deepEqual(contentHeaders('x-1.0.0.zip'), { contentType: 'application/zip', disposition: 'attachment' });
  assert.throws(() => contentHeaders('payload.exe'), /content type/);
});

test('the plan uploads every manifest file to data/<id>/<version>/, immutable and SHA-256 checked, SHA256SUMS last', () => {
  const fx = fixture();
  try {
    writeFileSync(path.join(fx.folder, 'stray.txt'), 'not in the manifest\n');
    const plan = planPublish({ id: fx.id, version: fx.version, manifest: fx.manifest, dataDir: path.join(fx.root, 'data'), bucket: 'netscied-data' });
    assert.deepEqual(plan.map((s) => s.path).sort(), fx.manifest.files.map((f) => f.path).sort());
    assert.equal(plan.at(-1).path, 'SHA256SUMS');
    assert.ok(!plan.some((s) => s.path === 'stray.txt'));
    for (const s of plan) {
      assert.equal(s.key, `data/${fx.id}/${fx.version}/${s.path}`);
      assert.deepEqual(s.head.slice(0, 2), ['s3api', 'head-object']);
      assert.ok(s.head.includes('--checksum-mode') && s.head[s.head.indexOf('--checksum-mode') + 1] === 'ENABLED');
      const put = s.put;
      assert.deepEqual(put.slice(0, 2), ['s3api', 'put-object']);
      const arg = (name) => put[put.indexOf(name) + 1];
      assert.equal(arg('--bucket'), 'netscied-data');
      assert.equal(arg('--key'), s.key);
      assert.equal(arg('--checksum-algorithm'), 'SHA256');
      assert.equal(arg('--checksum-sha256'), b64(s.sha256));
      assert.equal(arg('--cache-control'), IMMUTABLE);
      assert.equal(arg('--content-type'), contentHeaders(s.path).contentType);
      assert.equal(put.includes('--content-disposition'), contentHeaders(s.path).disposition === 'attachment');
    }
  } finally {
    fx.cleanup();
  }
});

test('a file over the 100,000,000-byte ceiling, or one whose bytes differ from the manifest, is refused', () => {
  const fx = fixture();
  try {
    const big = structuredClone(fx.manifest);
    big.files[1].bytes = 100_000_001;
    assert.throws(() => planPublish({ id: fx.id, version: fx.version, manifest: big, dataDir: path.join(fx.root, 'data'), bucket: 'netscied-data' }), /ceiling/);
    writeFileSync(path.join(fx.folder, 'edges.csv'), 'tampered\n');
    assert.throws(() => planPublish({ id: fx.id, version: fx.version, manifest: fx.manifest, dataDir: path.join(fx.root, 'data'), bucket: 'netscied-data' }), /edges\.csv/);
  } finally {
    fx.cleanup();
  }
});

// A fake aws: head-object answers from a map of key → base64 SHA-256.
function fakeAws(existing = {}) {
  const calls = [];
  const exec = async (args) => {
    calls.push(args);
    const key = args[args.indexOf('--key') + 1];
    if (args[1] === 'head-object') {
      if (!(key in existing)) return { status: 254, stdout: '', stderr: 'An error occurred (404) when calling the HeadObject operation: Not Found' };
      return { status: 0, stdout: JSON.stringify({ ContentLength: 1, ChecksumSHA256: existing[key] }), stderr: '' };
    }
    return { status: 0, stdout: '{}', stderr: '' };
  };
  return { exec, calls };
}

test('a first run uploads every file, SHA256SUMS last; a re-run skips the keys already there with the same bytes', async () => {
  const fx = fixture();
  try {
    const plan = planPublish({ id: fx.id, version: fx.version, manifest: fx.manifest, dataDir: path.join(fx.root, 'data'), bucket: 'netscied-data' });
    const first = fakeAws();
    const r1 = await runPublish(plan, first.exec, () => {});
    assert.equal(r1.uploaded.length, plan.length);
    const puts = first.calls.filter((a) => a[1] === 'put-object');
    assert.equal(puts.at(-1)[puts.at(-1).indexOf('--key') + 1], `data/${fx.id}/${fx.version}/SHA256SUMS`);
    // Every head-object runs before the first put-object.
    const firstPut = first.calls.findIndex((a) => a[1] === 'put-object');
    assert.ok(first.calls.slice(firstPut).every((a) => a[1] === 'put-object'));
    const all = Object.fromEntries(plan.map((s) => [s.key, b64(s.sha256)]));
    const again = fakeAws(all);
    const r2 = await runPublish(plan, again.exec, () => {});
    assert.deepEqual(r2.uploaded, []);
    assert.equal(r2.skipped.length, plan.length);
    assert.ok(!again.calls.some((a) => a[1] === 'put-object'));
    // A run that stopped half-way finishes the rest.
    const half = fakeAws(Object.fromEntries(plan.slice(0, 3).map((s) => [s.key, b64(s.sha256)])));
    const r3 = await runPublish(plan, half.exec, () => {});
    assert.equal(r3.skipped.length, 3);
    assert.equal(r3.uploaded.length, plan.length - 3);
  } finally {
    fx.cleanup();
  }
});

test('a key already holding different bytes stops the run before anything is uploaded', async () => {
  const fx = fixture();
  try {
    const plan = planPublish({ id: fx.id, version: fx.version, manifest: fx.manifest, dataDir: path.join(fx.root, 'data'), bucket: 'netscied-data' });
    const conflict = fakeAws({ [plan[2].key]: b64('0'.repeat(64)) });
    await assert.rejects(runPublish(plan, conflict.exec, () => {}), new RegExp(plan[2].path.replace(/\./g, '\\.')));
    assert.ok(!conflict.calls.some((a) => a[1] === 'put-object'));
    // An object without a SHA-256 checksum cannot be confirmed either.
    const unknown = fakeAws({ [plan[0].key]: undefined });
    await assert.rejects(runPublish(plan, unknown.exec, () => {}), /checksum/);
    assert.ok(!unknown.calls.some((a) => a[1] === 'put-object'));
  } finally {
    fx.cleanup();
  }
});

test('--dry-run prints the head-object and put-object commands and calls no aws', () => {
  const fx = fixture();
  try {
    const res = spawnSync(process.execPath, [cli, fx.id, fx.version, '--dry-run', '--data', path.join(fx.root, 'data'), '--catalog', path.join(fx.root, 'catalog')], {
      encoding: 'utf8',
      env: { PATH: '/nonexistent', NETSCIED_DATA_BUCKET: 'netscied-data' },
    });
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /aws s3api head-object --bucket netscied-data --key data\/test-graph\/1\.0\.0\/SHA256SUMS/);
    assert.match(res.stdout, /aws s3api put-object .*--checksum-algorithm SHA256/);
    const lines = res.stdout.split('\n').filter((l) => l.startsWith('aws s3api put-object'));
    assert.match(lines.at(-1), /SHA256SUMS/);
  } finally {
    fx.cleanup();
  }
});

test('the bucket comes from NETSCIED_DATA_BUCKET and must be a bucket name', () => {
  const fx = fixture();
  try {
    for (const bucket of [undefined, '', 'Bad_Bucket', 'netscied-data/../x']) {
      const env = { PATH: '/nonexistent', ...(bucket === undefined ? {} : { NETSCIED_DATA_BUCKET: bucket }) };
      const res = spawnSync(process.execPath, [cli, fx.id, fx.version, '--dry-run', '--data', path.join(fx.root, 'data'), '--catalog', path.join(fx.root, 'catalog')], { encoding: 'utf8', env });
      assert.notEqual(res.status, 0, String(bucket));
      assert.match(res.stderr, /NETSCIED_DATA_BUCKET/);
    }
  } finally {
    fx.cleanup();
  }
});
