// Agent readability (task 7.4; design D7). Claude Code's WebFetch and similar
// agents fetch a page without running JavaScript, convert the HTML to Markdown
// and read about the first 100,000 characters. This converts each page the same
// way (Turndown) and checks that its key facts fall within that window, so
// inline CSS and the transfer-state script never push content out.
//
//   node scripts/agent-readability.mjs [--root dist/netscied/browser]
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import TurndownService from 'turndown';

export const WINDOW = 100_000;

export function pageAsMarkdown(html) {
  const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
  td.remove(['script', 'style', 'noscript', 'template']);
  return td.turndown(html);
}

export function readabilityReport(html, mustContain) {
  const md = pageAsMarkdown(html);
  const head = md.slice(0, WINDOW);
  return { length: md.length, missing: mustContain.filter((s) => !head.includes(s)) };
}

function main() {
  const repoRoot = fileURLToPath(new URL('../', import.meta.url));
  const args = process.argv.slice(2);
  const i = args.lastIndexOf('--root');
  const root = path.resolve(i >= 0 ? args[i + 1] : path.join(repoRoot, 'dist', 'netscied', 'browser'));
  const json = (rel) => JSON.parse(readFileSync(path.join(root, rel), 'utf8'));
  const html = (rel) => readFileSync(path.join(root, rel), 'utf8');
  let failures = 0;
  const check = (label, page, must) => {
    const r = readabilityReport(html(page), must);
    const ok = r.missing.length === 0;
    if (!ok) failures++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: ${r.length} characters of Markdown${ok ? '' : `; missing in the first ${WINDOW}: ${r.missing.join(' | ')}`}`);
  };
  for (const d of json('api/v1/datasets.json')) {
    const full = json(`api/v1/datasets/${d.id}.json`);
    const files = full.latest_version ? full.latest_version.files.map((f) => f.url) : full.access.map((a) => a.url);
    check(`/datasets/${d.id}/`, `datasets/${d.id}/index.html`, [full.title['zh-Hant'], full.license.name['zh-Hant'], ...files]);
  }
  for (const c of json('api/v1/courses.json')) check(`/courses/${c.id}/`, `courses/${c.id}/index.html`, [c.title['zh-Hant'], c.university['zh-Hant']]);
  check('/datasets/', 'datasets/index.html', json('api/v1/datasets.json').map((d) => d.title['zh-Hant']));
  check('/courses/', 'courses/index.html', json('api/v1/courses.json').map((c) => c.title['zh-Hant']));
  check('/', 'index.html', ['搜尋台灣的網絡資料']);
  process.exit(failures ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
