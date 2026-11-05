// Writes dist/netscied/browser/sitemap.xml after `ng build` (agent-access spec,
// "Crawl policy and sitemap"). Pages come from Angular's prerendered-routes.json;
// each page's lastmod is the date of the last commit that touched its source.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadRedirects } from '../edge/build-function.mjs';

const ORIGIN = 'https://netscied.tw';
// Never indexable: the not-found page and the search results page (noindex).
const EXCLUDED = new Set(['/404', '/search']);

const escapeXml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

const canonical = (route) => (route === '/' ? '/' : `${route.replace(/\/+$/, '')}/`);

// Paths that answer with a redirect (task 11.2): the enabled rows of
// config/redirects.yaml and renamed dataset ids. Angular prerenders a
// meta-refresh page for each, but none of them is a page to index.
export function redirectSources(redirectsYaml, routesData = {}) {
  const enabled = loadRedirects(redirectsYaml).rows.filter((r) => r.enabled).map((r) => r.from);
  const aliases = (routesData.dataset_aliases ?? []).map((a) => `/datasets/${a.from}`);
  return [...enabled, ...aliases];
}

export function buildSitemap({ routes, origin = ORIGIN, lastmod, exclude = [] }) {
  const skip = new Set([...EXCLUDED, ...exclude.map((p) => p.replace(/\/+$/, '') || '/')]);
  const entries = routes
    .filter((r) => !skip.has(r.replace(/\/+$/, '') || '/'))
    .sort()
    .map(
      (r) => `  <url>\n    <loc>${escapeXml(origin + canonical(r))}</loc>\n    <lastmod>${lastmod(r)}</lastmod>\n  </url>`,
    );
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    entries.map((e) => `${e}\n`).join('') +
    '</urlset>\n'
  );
}

// The source files a route's page is built from.
export function sourcesForRoute(route) {
  const name = route === '/' ? 'home' : route.replace(/^\/+|\/+$/g, '');
  return [`src/app/pages/${name}`];
}

const git = (repoRoot, args) =>
  execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

// The date of the last commit that touched the page's sources. Needs full history:
// in a shallow clone every page would get HEAD's date, so the build stops instead.
export function gitLastmod(repoRoot, sources) {
  let shallow;
  try {
    shallow = git(repoRoot, ['rev-parse', '--is-shallow-repository']);
  } catch {
    throw new Error(`sitemap: page dates (lastmod) needs git history, but ${repoRoot} is not a git clone`);
  }
  if (shallow === 'true') {
    throw new Error('sitemap: this clone is shallow, so page dates would be wrong; fetch full history (git fetch --unshallow, or actions/checkout with fetch-depth: 0)');
  }
  const existing = sources.filter((s) => existsSync(path.join(repoRoot, s)));
  const date = git(repoRoot, ['log', '-1', '--format=%cs', '--', ...(existing.length ? existing : ['src/app'])]);
  // A page with no commit yet (new, uncommitted) is dated today.
  return date || new Date().toISOString().slice(0, 10);
}

function main() {
  const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
  const distRoot = path.join(repoRoot, 'dist', 'netscied');
  const routes = Object.keys(JSON.parse(readFileSync(path.join(distRoot, 'prerendered-routes.json'), 'utf8')).routes);
  const routesFile = path.join(distRoot, 'browser', '_data', 'routes.json');
  const routesData = existsSync(routesFile) ? JSON.parse(readFileSync(routesFile, 'utf8')) : {};
  const exclude = redirectSources(readFileSync(path.join(repoRoot, 'config', 'redirects.yaml'), 'utf8'), routesData);
  const xml = buildSitemap({ routes, exclude, lastmod: (r) => gitLastmod(repoRoot, sourcesForRoute(r)) });
  writeFileSync(path.join(distRoot, 'browser', 'sitemap.xml'), xml);
  console.log(`sitemap.xml: ${xml.match(/<url>/g)?.length ?? 0} pages`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
