// Deploys dist/netscied/browser to the site bucket (site-hosting spec, "Safe deploys").
//
//   NETSCIED_CF_DISTRIBUTION_ID=E… [NETSCIED_SITE_BUCKET=netscied.tw] [AWS_PROFILE=…] \
//     node scripts/deploy.mjs [--dry-run]
//
// Order: content-hashed assets, then other static files and machine files, then
// HTML, then one CloudFront invalidation. Nothing is ever deleted, so pages from
// the previous deploy keep loading their assets, and a deploy that fails part-way
// leaves the old HTML in place. The invalidation runs only after every upload succeeds.
import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { verifySiteStamp } from './build/check-site.mjs';

const IMMUTABLE = 'public, max-age=31536000, immutable';
const STATIC = 'public, max-age=86400';
const SHORT = 'public, max-age=300';
const PHASES = ['hashed', 'static', 'machine', 'html'];

const HASHED_BUNDLE = /^[a-z0-9-]+-[A-Z0-9]{8}\.(js|css)$/;
const BUNDLE_TYPES = { js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8' };
const MACHINE_TYPES = {
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
};

// How one build file (a path relative to the build directory) is uploaded.
export function classify(file) {
  const base = path.posix.basename(file);
  const ext = path.posix.extname(file);
  const bundle = HASHED_BUNDLE.exec(file);
  if (bundle) return { phase: 'hashed', cacheControl: IMMUTABLE, contentType: BUNDLE_TYPES[bundle[1]] };
  if (file.startsWith('media/')) return { phase: 'hashed', cacheControl: IMMUTABLE };
  if (file.startsWith('assets/') || file === 'favicon.ico') return { phase: 'static', cacheControl: STATIC };
  if (ext === '.html') return { phase: 'html', cacheControl: SHORT, contentType: 'text/html; charset=utf-8' };
  if (file === 'robots.txt' || file === 'llms.txt') return { phase: 'machine', cacheControl: SHORT, contentType: 'text/plain; charset=utf-8' };
  if (file === 'sitemap.xml') return { phase: 'machine', cacheControl: SHORT, contentType: 'application/xml; charset=utf-8' };
  if (base === 'feed.xml') return { phase: 'machine', cacheControl: SHORT, contentType: 'application/atom+xml; charset=utf-8' };
  if (MACHINE_TYPES[ext]) return { phase: 'machine', cacheControl: SHORT, contentType: MACHINE_TYPES[ext] };
  throw new Error(`deploy: unclassified file ${file}; add a rule to scripts/deploy.mjs`);
}

// Build files that are not part of the static site: Angular's client-side
// rendering fallback (task 11.4).
export const SKIP = new Set(['index.csr.html']);

export function planDeploy({ buildDir, files, bucket, distributionId }) {
  const groups = new Map();
  for (const file of [...files].filter((f) => !SKIP.has(f)).sort()) {
    const c = classify(file);
    const key = `${PHASES.indexOf(c.phase)}|${c.cacheControl}|${c.contentType ?? ''}`;
    if (!groups.has(key)) groups.set(key, { ...c, files: [] });
    groups.get(key).files.push(file);
  }
  const uploads = [...groups.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, g]) => ({
      phase: g.phase,
      label: `upload ${g.phase} (${g.files.length} files, ${g.contentType ?? 'type by extension'})`,
      files: g.files,
      args: [
        's3', 'cp', `${buildDir}/`, `s3://${bucket}/`, '--recursive', '--exclude', '*',
        ...g.files.flatMap((f) => ['--include', f]),
        '--cache-control', g.cacheControl,
        ...(g.contentType ? ['--content-type', g.contentType] : []),
        '--only-show-errors',
      ],
    }));
  const invalidate = {
    phase: 'invalidate',
    label: 'invalidate /*',
    args: ['cloudfront', 'create-invalidation', '--distribution-id', distributionId, '--paths', '/*'],
  };
  return [...uploads, invalidate];
}

// Runs the steps in order; the first failure stops the deploy.
export async function runDeploy(plan, exec) {
  for (const step of plan) {
    try {
      await exec(step.args, step);
    } catch (err) {
      throw new Error(`deploy stopped at "${step.label}": ${err.message}`);
    }
  }
}

function listFiles(dir, prefix = '') {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    return entry.isDirectory() ? listFiles(path.join(dir, entry.name), rel) : [rel];
  });
}

const shellQuote = (arg) => (/^[\w/.:=@,+-]+$/.test(arg) ? arg : `'${arg.replace(/'/g, `'\\''`)}'`);

function awsExec(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('aws', args, { stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`aws exited with ${code}`))));
  });
}

async function main() {
  const repoRoot = fileURLToPath(new URL('../', import.meta.url));
  const args = process.argv.slice(2);
  const b = args.lastIndexOf('--build');
  const buildDir = b >= 0 ? path.resolve(args[b + 1]) : path.join(repoRoot, 'dist', 'netscied', 'browser');
  const distributionId = process.env.NETSCIED_CF_DISTRIBUTION_ID;
  const bucket = process.env.NETSCIED_SITE_BUCKET || 'netscied.tw';
  if (!existsSync(buildDir)) throw new Error(`no build at ${buildDir}; run "pnpm build" first`);
  if (!distributionId) throw new Error('set NETSCIED_CF_DISTRIBUTION_ID to the CloudFront distribution id');
  // Only a build that passed the site check (contact-details scan) is deployed.
  const stamp = verifySiteStamp(buildDir);
  if (!stamp.ok) throw new Error(`deploy refused: ${stamp.reason} (the site check must pass on exactly this build)`);

  const plan = planDeploy({ buildDir, files: listFiles(buildDir), bucket, distributionId });
  if (process.argv.includes('--dry-run')) {
    for (const step of plan) console.log(`# ${step.label}\naws ${step.args.map(shellQuote).join(' ')}`);
    return;
  }
  await runDeploy(plan, (args, step) => {
    console.log(`→ ${step.label}`);
    return awsExec(args);
  });
  console.log('deploy complete');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
