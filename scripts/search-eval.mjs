// The search quality gate (task 6.5; site-search spec, "Search quality gate").
// Runs catalog/search-gold.yaml against the built /api/v1/catalog.json with the
// same search core the browser uses, and fails the build on:
// - an expected, published record missing from a query's top 5;
// - a forbidden record in the top 5;
// - expect_zero / expect_nonzero / expected_wanted not met;
// - a Simplified, 臺/台-swapped or full-width variant of a Traditional query
//   returning a different top result.
// Expected records that are not published (wanted, withdrawn, not yet added)
// are skipped and reported, so a takedown never breaks the build.
//
//   node scripts/search-eval.mjs [--catalog build/site/api/v1/catalog.json] [--gold catalog/search-gold.yaml]
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createSearch } from '../search/core.ts';
import { readYaml } from './catalog/lib/yaml.mjs';
import { toSimplified } from './search/opencc.mjs';

const TOP = 5;

export function variants(q) {
  return {
    simplified: toSimplified(q),
    swapped: q.replace(/[臺台]/g, (c) => (c === '臺' ? '台' : '臺')),
    fullwidth: q.replace(/[!-~]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0xfee0)).replace(/ /g, '　'),
  };
}

export function evaluateGold(catalog, queries) {
  const search = createSearch(catalog);
  const published = new Map();
  for (const r of catalog.records) if (r.status === 'published') published.set(`${r.type === 'course' ? 'courses' : 'datasets'}:${r.id}`, r);
  const wantedIds = new Set(catalog.records.filter((r) => r.type === 'wanted').map((r) => r.id));
  const failures = [];
  const skipped = [];
  let checked = 0;
  let invariance = 0;
  let rr = 0;
  let rrCount = 0;

  for (const g of queries) {
    const mode = g.mode === 'courses' ? 'courses' : 'datasets';
    const res = search.search(g.q, mode);
    const top = res.hits.slice(0, TOP).map((h) => h.id);
    const label = `"${g.q}" (${mode})`;
    checked += 1;
    for (const id of g.expected ?? []) {
      if (!published.has(`${mode}:${id}`)) {
        skipped.push(`${g.q}: ${id} (not published)`);
        continue;
      }
      const rank = res.hits.findIndex((h) => h.id === id);
      if (rank < 0 || rank >= TOP) failures.push(`${label}: expected ${id} in the top ${TOP}, got [${top.join(', ')}]`);
      rr += rank >= 0 ? 1 / (rank + 1) : 0;
      rrCount += 1;
    }
    if (g.first && published.has(`${mode}:${g.first}`) && res.hits[0]?.id !== g.first) {
      failures.push(`${label}: expected ${g.first} first, got ${res.hits[0]?.id ?? 'nothing'}`);
    }
    for (const id of g.forbidden ?? []) {
      if (top.includes(id)) failures.push(`${label}: forbidden result ${id} is in the top ${TOP}`);
    }
    if (g.expect_zero && res.hits.length) failures.push(`${label}: expected no results, got [${top.join(', ')}]`);
    if (g.expect_nonzero && !res.hits.length) failures.push(`${label}: expected at least one result, got none`);
    for (const id of g.expected_wanted ?? []) {
      if (!wantedIds.has(id)) {
        skipped.push(`${g.q}: wanted ${id} (not a wanted entry)`);
        continue;
      }
      if (!res.wanted.some((w) => w.id === id)) failures.push(`${label}: expected the wanted entry ${id} in the wanted group`);
    }
    if (g.lang === 'zh-Hant' && g.invariance !== false) {
      const want = res.hits[0]?.id ?? null;
      for (const [name, q] of Object.entries(variants(g.q))) {
        if (q === g.q) continue;
        invariance += 1;
        const got = search.search(q, mode).hits[0]?.id ?? null;
        if (got !== want) failures.push(`${label}: the ${name} variant "${q}" returns ${got ?? 'nothing'} first, the query returns ${want ?? 'nothing'}`);
      }
    }
  }
  return { failures, skipped, checked, invariance, mrr: rrCount ? rr / rrCount : null };
}

function main() {
  const args = process.argv.slice(2);
  const opt = (name, fallback) => {
    const i = args.lastIndexOf(name);
    return i >= 0 ? args[i + 1] : fallback;
  };
  const repoRoot = fileURLToPath(new URL('../', import.meta.url));
  const catalogPath = path.resolve(opt('--catalog', path.join(repoRoot, 'build', 'site', 'api', 'v1', 'catalog.json')));
  const goldPath = path.resolve(opt('--gold', path.join(repoRoot, 'catalog', 'search-gold.yaml')));
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
  const { data, error } = readYaml(goldPath);
  if (error) {
    console.error(`${goldPath}: ${error}`);
    process.exit(1);
  }
  const r = evaluateGold(catalog, data.queries ?? []);
  for (const s of r.skipped) console.log(`skipped: ${s}`);
  for (const f of r.failures) console.error(`search gold set: ${f}`);
  console.log(
    `search gold set: ${r.checked} queries, ${r.invariance} script variants, ${r.failures.length} failures, ${r.skipped.length} skipped${r.mrr === null ? '' : `, MRR ${r.mrr.toFixed(3)} (reported, not a gate)`}`,
  );
  process.exit(r.failures.length ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
