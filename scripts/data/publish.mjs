// Uploads one verified dataset version to the data bucket (task 8.6; data-curation
// spec, "Human gate on publication"). Run only by .github/workflows/publish.yml,
// after `netscied verify` has rebuilt the version byte-identically into
// build/data/<id>/<version>/:
//
//   NETSCIED_DATA_BUCKET=netscied-data node scripts/data/publish.mjs <id> <version> [--dry-run]
//
// Every file the committed manifest lists goes to
// s3://$NETSCIED_DATA_BUCKET/data/<id>/<version>/<path> with one PutObject, which
// S3 checks against the manifest's SHA-256 (--checksum-sha256). Files are
// immutable (cached a year); data files download as attachments, while
// SHA256SUMS, ATTRIBUTION.txt and provenance.json show inline. SHA256SUMS goes
// last, so a listed version is complete. Before anything is uploaded, every key
// is checked with head-object: a key already holding the same SHA-256 is
// skipped (a re-run is safe), and a key holding other bytes stops the run with
// nothing uploaded. The job's role cannot delete, so a version is never removed.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const CEILING = 100_000_000; // design D5: 100 MB per hosted file
export const CACHE_CONTROL = 'public, max-age=31536000, immutable';
const ID = /^[a-z0-9][a-z0-9-]*$/;
const SEMVER = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;
const SAFE_PATH = /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/;
const BUCKET = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;

export function validateTarget(id, version) {
  if (typeof id !== 'string' || !ID.test(id)) throw new Error(`publish: dataset id ${JSON.stringify(id)} must match ${ID}`);
  if (typeof version !== 'string' || !SEMVER.test(version)) throw new Error(`publish: version ${JSON.stringify(version)} must be a semantic version like 1.0.0`);
}

const TYPES = {
  '.csv': 'text/csv; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.graphml': 'application/graphml+xml; charset=utf-8',
  '.zip': 'application/zip',
  '.txt': 'text/plain; charset=utf-8',
};
// Read in the browser rather than saved: the checksum list, the attribution and the provenance record.
const INLINE = new Set(['SHA256SUMS', 'ATTRIBUTION.txt', 'provenance.json']);

export function contentHeaders(file) {
  const base = path.posix.basename(file);
  if (base === 'SHA256SUMS') return { contentType: 'text/plain; charset=utf-8', disposition: null };
  const contentType = TYPES[path.posix.extname(base).toLowerCase()];
  if (!contentType) throw new Error(`publish: no content type for ${file}; add its extension to scripts/data/publish.mjs`);
  return { contentType, disposition: INLINE.has(file) ? null : 'attachment' };
}

function sha256File(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

export function planPublish({ id, version, manifest, dataDir, bucket }) {
  validateTarget(id, version);
  if (!BUCKET.test(bucket ?? '')) throw new Error(`publish: NETSCIED_DATA_BUCKET ${JSON.stringify(bucket)} is not a bucket name`);
  if (manifest.dataset !== id || manifest.version !== version) throw new Error(`publish: the manifest is for ${manifest.dataset} ${manifest.version}, not ${id} ${version}`);
  if (manifest.withdrawn || manifest.suspended) throw new Error(`publish: ${id} ${version} is withdrawn or suspended`);
  const folder = path.join(dataDir, id, version);
  const steps = [];
  for (const f of manifest.files) {
    if (!SAFE_PATH.test(f.path) || f.path.split('/').some((seg) => seg === '.' || seg === '..')) throw new Error(`publish: unsafe file path ${JSON.stringify(f.path)} in the manifest`);
    if (f.bytes > CEILING) throw new Error(`publish: ${f.path} is ${f.bytes} bytes, over the per-file ceiling of ${CEILING} bytes`);
    const local = path.join(folder, f.path);
    if (!existsSync(local)) throw new Error(`publish: ${f.path} is missing from ${folder}; run netscied verify ${id} ${version} first`);
    const size = statSync(local).size;
    if (size > CEILING) throw new Error(`publish: ${f.path} is ${size} bytes, over the per-file ceiling of ${CEILING} bytes`);
    if (size !== f.bytes || sha256File(local) !== f.sha256) throw new Error(`publish: ${f.path} in ${folder} does not match the manifest; run netscied verify ${id} ${version} again`);
    const key = `data/${id}/${version}/${f.path}`;
    const { contentType, disposition } = contentHeaders(f.path);
    const checksum = Buffer.from(f.sha256, 'hex').toString('base64');
    steps.push({
      path: f.path,
      key,
      local,
      sha256: f.sha256,
      checksum,
      bytes: f.bytes,
      head: ['s3api', 'head-object', '--bucket', bucket, '--key', key, '--checksum-mode', 'ENABLED', '--output', 'json'],
      put: [
        's3api', 'put-object', '--bucket', bucket, '--key', key, '--body', local,
        '--content-type', contentType,
        ...(disposition ? ['--content-disposition', disposition] : []),
        '--cache-control', CACHE_CONTROL,
        '--checksum-algorithm', 'SHA256', '--checksum-sha256', checksum,
        '--output', 'json',
      ],
    });
  }
  // SHA256SUMS last: once it is there, every file it lists is.
  return [...steps.filter((s) => s.path !== 'SHA256SUMS'), ...steps.filter((s) => s.path === 'SHA256SUMS')];
}

const NOT_FOUND = /\(404\)|Not Found|NoSuchKey/;

// exec(args) resolves to { status, stdout, stderr } and never throws on a non-zero exit.
export async function runPublish(plan, exec, log = console.log) {
  const present = new Set();
  const conflicts = [];
  for (const step of plan) {
    const r = await exec(step.head, step);
    if (r.status !== 0) {
      if (NOT_FOUND.test(r.stderr ?? '')) continue;
      throw new Error(`publish: head-object ${step.key} failed: ${(r.stderr ?? '').trim()}`);
    }
    const head = JSON.parse(r.stdout || '{}');
    if (!head.ChecksumSHA256) conflicts.push(`${step.path} (already there, with no SHA-256 checksum to compare)`);
    else if (head.ChecksumSHA256 !== step.checksum) conflicts.push(`${step.path} (already there with other bytes: SHA-256 ${head.ChecksumSHA256}, the manifest says ${step.checksum})`);
    else present.add(step.key);
  }
  if (conflicts.length) throw new Error(`publish: stopped before uploading anything; a published version is immutable:\n  ${conflicts.join('\n  ')}`);
  const uploaded = [];
  const skipped = [];
  for (const step of plan) {
    if (present.has(step.key)) {
      skipped.push(step.path);
      log(`= ${step.key} (already there, same SHA-256)`);
      continue;
    }
    const r = await exec(step.put, step);
    if (r.status !== 0) throw new Error(`publish: stopped at put-object ${step.key}: ${(r.stderr ?? '').trim()}`);
    uploaded.push(step.path);
    log(`+ ${step.key} (${step.bytes} bytes)`);
  }
  return { uploaded, skipped };
}

function awsExec(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('aws', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', reject);
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

const shellQuote = (arg) => (/^[\w/.:=@,+-]+$/.test(arg) ? arg : `'${arg.replace(/'/g, `'\\''`)}'`);

async function main() {
  const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
  const args = process.argv.slice(2);
  const opt = (name, fallback) => {
    const i = args.lastIndexOf(name);
    return i >= 0 ? args[i + 1] : fallback;
  };
  const positional = args.filter((a, i) => !a.startsWith('--') && !['--data', '--catalog'].includes(args[i - 1]));
  const [id, version] = positional;
  validateTarget(id, version);
  const bucket = process.env.NETSCIED_DATA_BUCKET;
  if (!bucket || !BUCKET.test(bucket)) throw new Error(`publish: set NETSCIED_DATA_BUCKET to the data bucket's name (got ${JSON.stringify(bucket ?? null)})`);
  const dataDir = path.resolve(opt('--data', path.join(repoRoot, 'build', 'data')));
  const catalogDir = path.resolve(opt('--catalog', path.join(repoRoot, 'catalog')));
  const manifestPath = path.join(catalogDir, 'versions', id, `${version}.json`);
  if (!existsSync(manifestPath)) throw new Error(`publish: no manifest at ${manifestPath}`);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const plan = planPublish({ id, version, manifest, dataDir, bucket });
  if (args.includes('--dry-run')) {
    for (const step of plan) console.log(`aws ${step.head.map(shellQuote).join(' ')}`);
    for (const step of plan) console.log(`aws ${step.put.map(shellQuote).join(' ')}`);
    return;
  }
  const { uploaded, skipped } = await runPublish(plan, awsExec);
  console.log(`published ${id} ${version}: ${uploaded.length} uploaded, ${skipped.length} already there`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
