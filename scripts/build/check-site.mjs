// Scans the built site for contact details (researcher-registry spec: no public
// file may contain something that looks like an email address or a Taiwanese
// phone number, other than the site's own contact address). Runs after ng build
// over every text file a visitor or agent can fetch: HTML, Markdown, JSON, CSV,
// plain text and XML. Script bundles are not scanned: they hold no content.
//
// A passing check writes site-check.json beside the site folder (outside what is
// uploaded): a digest of every file. scripts/deploy.mjs refuses a build whose
// stamp is missing or no longer matches (review of Milestone A, finding 9).
//
//   node scripts/build/check-site.mjs [--root dist/netscied/browser]
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { findPii } from '../catalog/lib/pii.mjs';

const TEXT = new Set(['.html', '.md', '.json', '.csv', '.txt', '.xml', '.svg', '.webmanifest']);

function* walk(dir, prefix = '') {
  for (const name of readdirSync(dir).sort()) {
    const full = path.join(dir, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    if (statSync(full).isDirectory()) yield* walk(full, rel);
    else yield [rel, full];
  }
}

export function scanSite(root) {
  const problems = [];
  let files = 0;
  for (const [rel, full] of walk(root)) {
    if (!TEXT.has(path.extname(rel))) continue;
    files += 1;
    const text = readFileSync(full, 'utf8');
    for (const hit of findPii(text)) problems.push({ file: rel, ...hit });
  }
  return { problems, files };
}

export const stampPath = (root) => path.join(path.dirname(path.resolve(root)), 'site-check.json');

// A digest of the whole build: every file's path and content.
export function siteDigest(root) {
  const h = createHash('sha256');
  for (const [rel, full] of walk(root)) {
    h.update(rel);
    h.update('\0');
    h.update(createHash('sha256').update(readFileSync(full)).digest('hex'));
    h.update('\n');
  }
  return h.digest('hex');
}

export function verifySiteStamp(root) {
  const file = stampPath(root);
  if (!existsSync(file)) return { ok: false, reason: `no site check stamp at ${file}; run "pnpm build"` };
  const stamp = JSON.parse(readFileSync(file, 'utf8'));
  if (stamp.digest !== siteDigest(root)) return { ok: false, reason: 'the build changed after the site check; run "pnpm build" again' };
  return { ok: true, stamp };
}

function main() {
  const args = process.argv.slice(2);
  const i = args.lastIndexOf('--root');
  const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
  const root = path.resolve(i >= 0 ? args[i + 1] : path.join(repoRoot, 'dist', 'netscied', 'browser'));
  const { problems, files } = scanSite(root);
  for (const p of problems) {
    console.error(`error: ${p.file}: looks like ${p.kind === 'email' ? 'an email address' : 'a phone number'} ("${p.value}"); public files must not hold contact details`);
  }
  console.log(`site check: ${files} text files scanned for contact details, ${problems.length} found`);
  const stamp = stampPath(root);
  if (problems.length) {
    rmSync(stamp, { force: true });
    process.exit(1);
  }
  writeFileSync(stamp, JSON.stringify({ checked_at: new Date().toISOString(), files, digest: siteDigest(root) }, null, 2) + '\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
