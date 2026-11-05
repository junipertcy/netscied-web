// Scans the built site for contact details (researcher-registry spec: no public
// file may contain something that looks like an email address or a Taiwanese
// phone number, other than the site's own contact address). Runs after ng build
// over every text file a visitor or agent can fetch: HTML, Markdown, JSON, CSV,
// plain text and XML. Script bundles are not scanned: they hold no content.
//
//   node scripts/build/check-site.mjs [--root dist/netscied/browser]
import { readFileSync, readdirSync, statSync } from 'node:fs';
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
  process.exit(problems.length ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
