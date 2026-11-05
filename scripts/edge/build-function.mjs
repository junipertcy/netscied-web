// Embeds config/redirects.yaml into infra/cloudfront/viewer-request.js, between its
// redirects:begin/end markers. CloudFront Functions cannot read files, so the map is
// compiled in; the test suite fails if the committed function is out of date.
//
//   pnpm edge:build           rewrite the function
//   pnpm edge:build --check   exit 1 if it is out of date
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from 'yaml';

const BEGIN = '/* redirects:begin */';
const END = '/* redirects:end */';

export function loadRedirects(text) {
  const doc = parse(text) ?? {};
  if (typeof doc.canonical_host !== 'string') throw new Error('redirects.yaml: "canonical_host" is required');
  const redirectHosts = doc.redirect_hosts ?? [];
  const seen = new Set();
  const rows = (doc.paths ?? []).map((row) => {
    const { from, to } = row;
    if (typeof from !== 'string' || !from.startsWith('/')) throw new Error(`redirects.yaml: "from" must start with "/": ${from}`);
    if (from !== '/' && from.endsWith('/')) throw new Error(`redirects.yaml: "from" must not end with a trailing slash: ${from}`);
    if (seen.has(from)) throw new Error(`redirects.yaml: duplicate "from": ${from}`);
    seen.add(from);
    if (typeof to !== 'string' || !(/^\/(?!\/)/.test(to) || /^https:\/\/[^/]/.test(to))) {
      throw new Error(`redirects.yaml: "to" must be a site path or an https URL: ${to}`);
    }
    return { from, to, enabled: row.enabled !== false };
  });
  return { canonicalHost: doc.canonical_host, redirectHosts, rows };
}

export function edgeConfig(redirects, { includeDisabled = false } = {}) {
  const paths = {};
  for (const row of redirects.rows) if (row.enabled || includeDisabled) paths[row.from] = row.to;
  return { canonicalHost: redirects.canonicalHost, redirectHosts: redirects.redirectHosts, paths };
}

export function renderFunction(source, config) {
  const begin = source.indexOf(BEGIN);
  const end = source.indexOf(END);
  if (begin < 0 || end < begin) throw new Error('viewer-request.js: redirects:begin/end markers not found');
  return source.slice(0, begin + BEGIN.length) + JSON.stringify(config) + source.slice(end);
}

function main() {
  const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
  const functionPath = path.join(repoRoot, 'infra', 'cloudfront', 'viewer-request.js');
  const source = readFileSync(functionPath, 'utf8');
  const redirects = loadRedirects(readFileSync(path.join(repoRoot, 'config', 'redirects.yaml'), 'utf8'));
  const rendered = renderFunction(source, edgeConfig(redirects));
  if (process.argv.includes('--check')) {
    if (rendered !== source) {
      console.error('infra/cloudfront/viewer-request.js is out of date; run "pnpm edge:build".');
      process.exit(1);
    }
    return;
  }
  writeFileSync(functionPath, rendered);
  console.log(`viewer-request.js: ${Buffer.byteLength(rendered)} bytes, ${Object.keys(edgeConfig(redirects).paths).length} path redirects enabled`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
