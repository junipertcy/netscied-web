// Writes a fallback page for every enabled redirect in config/redirects.yaml
// (task 5.6). In production the CloudFront function answers these paths with a
// 301 before the bucket is reached; the pages make a bare origin (or a cached
// old link) still land on the new URL. Runs after ng build, overwriting the
// meta-refresh pages Angular writes for redirectTo routes, whose targets lose
// their trailing slash.
//
//   node scripts/build/redirect-pages.mjs [--root dist/netscied/browser]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadRedirects } from '../edge/build-function.mjs';
import { escapeXml } from '../catalog/lib/text.mjs';

export function redirectPage(target) {
  const t = escapeXml(target);
  return `<!doctype html>
<html lang="zh-Hant-TW">
<head>
<meta charset="utf-8">
<title>此頁已移動 - 台灣網絡科學教育</title>
<meta name="robots" content="noindex">
<meta http-equiv="refresh" content="0; url=${t}">
<link rel="canonical" href="${t}">
</head>
<body>
<p>此頁已移到 <a href="${t}">${t}</a>。</p>
</body>
</html>
`;
}

export function writeRedirectPages(redirectsYaml, root) {
  const { canonicalHost, rows } = loadRedirects(redirectsYaml);
  const written = [];
  for (const row of rows.filter((r) => r.enabled)) {
    const target = row.to.startsWith('/') ? `https://${canonicalHost}${row.to}` : row.to;
    const rel = `${row.from.replace(/^\/+/, '')}/index.html`;
    mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    writeFileSync(path.join(root, rel), redirectPage(target));
    written.push(rel);
  }
  return written;
}

function main() {
  const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
  const args = process.argv.slice(2);
  const i = args.lastIndexOf('--root');
  const root = path.resolve(i >= 0 ? args[i + 1] : path.join(repoRoot, 'dist', 'netscied', 'browser'));
  const written = writeRedirectPages(readFileSync(path.join(repoRoot, 'config', 'redirects.yaml'), 'utf8'), root);
  console.log(`redirect pages: ${written.length} written (${written.map((w) => '/' + w.replace(/index\.html$/, '')).join(', ')})`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
