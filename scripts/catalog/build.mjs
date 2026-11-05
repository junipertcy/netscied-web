// Generates everything the site and the machines read from the catalog (task 3.5;
// design D1, agent-access spec): the static JSON API under /api/v1/, and the
// page data the Angular prerender reads under /_data/. Output goes to a build
// directory (default build/site/), which angular.json copies into the site.
//
//   node scripts/catalog/build.mjs [--root .] [--out build/site] [--today YYYY-MM-DD]
//                                  [--no-git] [--skip-validate]
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { marked } from 'marked';
import { validateCatalog, taipeiToday, formatIssue } from './validate.mjs';
import { readYaml } from './lib/yaml.mjs';
import { schemaDir } from './lib/schemas.mjs';
import { ORIGIN, buildCourseRecord, buildDatasetRecord, buildWantedEntry, courseSummary, datasetSummary } from './lib/api.mjs';
import { courseSearchRecord, datasetSearchRecord, wantedSearchRecord } from './lib/search-records.mjs';
import { joinLines, toCsv } from './lib/text.mjs';
import { makeNormalizeData } from '../search/normalize-data.mjs';
import { createSearch } from '../../search/core.ts';
import { renderOutputs } from './lib/outputs.mjs';

export const API_VERSION = '1';
export const LAST_BREAKING_CHANGE = '2026-11-04';
export const SEARCH_BUDGET_BYTES = 150 * 1024;
const MARKER = '.netscied-build';

function gitDate(root, paths) {
  try {
    const existing = paths.filter((p) => existsSync(path.join(root, p)));
    if (!existing.length) return null;
    const out = execFileSync('git', ['log', '-1', '--format=%cs', '--', ...existing], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return out || null;
  } catch {
    return null;
  }
}

const stable = (value) => JSON.stringify(value, null, 2) + '\n';

export function buildSite({ root, out, today = taipeiToday(), useGit = true, skipValidate = false, baseRef = 'origin/main', log = console.log }) {
  const result = validateCatalog({ root, baseRef: skipValidate ? 'none' : baseRef, today });
  if (result.errors.length && !skipValidate) {
    for (const e of result.errors) console.error(formatIssue('error', e));
    throw new Error(`catalog validation failed with ${result.errors.length} errors; nothing was generated`);
  }
  const cat = result.catalog;
  const { vocab } = cat;
  const people = new Map(cat.people.map((p) => [p.data.id, p.data]));
  const manifests = new Map();
  for (const v of cat.versions) {
    if (!manifests.has(v.dir)) manifests.set(v.dir, []);
    manifests.get(v.dir).push(v.data);
  }
  const updatedOf = (paths, fallback) => (useGit ? gitDate(root, paths) ?? today : fallback);

  // --- Records ----------------------------------------------------------------
  const datasetSources = cat.datasets.map((d) => d.data);
  const fullDatasets = [];
  for (const src of datasetSources) {
    if (src.status === 'wanted') continue;
    const updated = updatedOf([`catalog/datasets/${src.id}.yaml`, `catalog/versions/${src.id}`], src.added);
    fullDatasets.push({ src, full: buildDatasetRecord(src, { vocab, people, manifests: manifests.get(src.id) ?? [], updated }) });
  }
  const sortKey = (f) => f.full.latest_version?.released ?? f.full.published ?? f.full.added ?? '';
  const published = fullDatasets.filter((f) => f.full.status === 'published').sort((a, b) => sortKey(b).localeCompare(sortKey(a)) || a.full.id.localeCompare(b.full.id));
  const withdrawn = fullDatasets.filter((f) => f.full.status === 'withdrawn');
  const wantedSources = datasetSources.filter((d) => d.status === 'wanted' || (d.status === 'published' && d.wanted));
  const wanted = wantedSources
    .map((src) => ({ src, entry: buildWantedEntry(src, vocab) }))
    .sort((a, b) => (a.entry.status === 'published') - (b.entry.status === 'published') || b.entry.requests - a.entry.requests || a.entry.id.localeCompare(b.entry.id));

  const courses = cat.courses
    .map(({ data: src }) => ({ src, full: buildCourseRecord(src, { vocab, today, updated: updatedOf([`catalog/courses/${src.id}.yaml`], src.provenance.reviewed) }) }))
    .sort((a, b) => {
      const ta = a.full.offerings[0]?.term ?? '';
      const tb = b.full.offerings[0]?.term ?? '';
      const ia = a.full.historical ? -1 : 0;
      const ib = b.full.historical ? -1 : 0;
      return ib - ia || termSort(tb) - termSort(ta) || a.full.id.localeCompare(b.full.id);
    });

  // --- News ---------------------------------------------------------------------
  const news = cat.news
    .filter((n) => n.data)
    .map((n) => ({
      id: n.data.id,
      date: n.data.date,
      url: `${ORIGIN}/news/#${n.data.id}`,
      title: n.data.title,
      body_md: n.body.trim(),
      body_html: marked.parse(joinLines(n.body.trim()), { async: false }),
      related: n.data.related ?? {},
      generated: false,
    }));
  for (const { src, full } of published) {
    if (src.announce === false) continue;
    const date = full.published;
    news.push({
      id: `${date}-${full.id}`,
      date,
      url: `${ORIGIN}/news/#${date}-${full.id}`,
      title: { 'zh-Hant': `新增資料集：${full.title['zh-Hant']}`, ...(full.title.en ? { en: `New dataset: ${full.title.en}` } : {}) },
      body_md: `本站新收錄「[${full.title['zh-Hant']}](/datasets/${full.id}/)」。${full.summary['zh-Hant']}`,
      body_html: `<p>本站新收錄「<a href="/datasets/${full.id}/">${escapeHtml(full.title['zh-Hant'])}</a>」。${escapeHtml(full.summary['zh-Hant'])}</p>\n`,
      related: { datasets: [full.id] },
      generated: true,
    });
  }
  news.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));

  // --- Search catalog -----------------------------------------------------------------
  const searchRecords = [
    ...published.map(({ src, full }) => datasetSearchRecord(src, full, vocab)),
    ...wanted.filter((w) => w.entry.status !== 'published').map(({ src, entry }) => wantedSearchRecord(src, entry, vocab)),
    ...courses.map(({ src, full }) => courseSearchRecord(src, full, vocab)),
  ];
  const corpus = searchRecords.flatMap((r) => [r.title.zh, r.title.en, r.description, r.en, ...r.keywords, ...r.aliases]);
  const catalogJson = { schema: 1, generated: today, normalize: makeNormalizeData(vocab.concepts, corpus), records: searchRecords };
  const catalogText = JSON.stringify(catalogJson);
  const gz = gzipSync(Buffer.from(catalogText)).length;
  if (gz > SEARCH_BUDGET_BYTES) {
    throw new Error(
      `search payload budget exceeded: /api/v1/catalog.json is ${(gz / 1024).toFixed(1)} KB gzipped, over the 150 KB budget (site-search spec). This is the trigger for the add-search-endpoint change.`,
    );
  }

  // --- Home examples ------------------------------------------------------------------
  const counts = { datasets: published.length, hosted: published.filter((f) => f.full.hosted).length, wanted: wanted.filter((w) => w.entry.status !== 'published').length, withdrawn: withdrawn.length, courses: courses.length };
  const homeConfig = existsSync(path.join(root, 'config', 'home.yaml')) ? readYaml(path.join(root, 'config', 'home.yaml')).data ?? {} : {};
  const searcher = createSearch(catalogJson);
  const examples = [];
  for (const ex of homeConfig.examples ?? []) {
    const type = ex.type === 'courses' ? 'courses' : 'datasets';
    const res = searcher.search(ex.q, type);
    if (res.hits.length === 0) {
      log(`warning: home example "${ex.q}" (${type}) returns no results; it is left off the home page`);
      continue;
    }
    examples.push({ q: ex.q, type, href: `/search/?q=${encodeURIComponent(ex.q)}${type === 'courses' ? '&type=courses' : ''}` });
  }
  if (examples.length > 5) examples.length = 5;

  // --- Write --------------------------------------------------------------------------
  if (existsSync(out)) {
    if (!existsSync(path.join(out, MARKER)) && readdirSync(out).length) throw new Error(`refusing to clear ${out}: it is not a build directory`);
    rmSync(out, { recursive: true, force: true });
  }
  mkdirSync(out, { recursive: true });
  writeFileSync(path.join(out, MARKER), 'generated by scripts/catalog/build.mjs\n');
  const files = [];
  const write = (rel, content, meta) => {
    const file = path.join(out, rel);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content);
    if (meta) files.push({ path: `/${rel}`, url: `${ORIGIN}/${rel}`, ...meta });
  };

  const summaries = published.map((f) => datasetSummary(f.full));
  write('api/v1/datasets.json', stable(summaries), { media_type: 'application/json', description: 'All published datasets, summary form' });
  write(
    'api/v1/datasets.csv',
    toCsv(
      ['id', 'title_zh', 'title_en', 'kinds', 'domains', 'license', 'redistribution', 'latest_version', 'released', 'nodes', 'edges', 'hyperedges', 'size_approximate', 'temporal_start', 'temporal_end', 'personal_data', 'url', 'api_url'],
      summaries.map((s) => ({
        id: s.id,
        title_zh: s.title['zh-Hant'],
        title_en: s.title.en,
        kinds: s.kinds,
        domains: s.domains.map((d) => d.id),
        license: s.license.id,
        redistribution: s.redistribution,
        latest_version: s.latest_version?.version,
        released: s.latest_version?.released,
        nodes: s.size?.nodes,
        edges: s.size?.edges,
        hyperedges: s.size?.hyperedges,
        size_approximate: s.size ? String(!!s.size.approximate) : '',
        temporal_start: s.temporal?.start,
        temporal_end: s.temporal?.ongoing ? 'ongoing' : s.temporal?.end,
        personal_data: s.personal_data,
        url: s.url,
        api_url: s.api_url,
      })),
    ),
    { media_type: 'text/csv', description: 'All published datasets as CSV (UTF-8, no BOM)' },
  );
  for (const { full } of [...published, ...withdrawn]) {
    write(`api/v1/datasets/${full.id}.json`, stable(full), { media_type: 'application/json', description: `Dataset record: ${full.id}` });
  }
  for (const { full } of published) {
    for (const alias of full.aliases) {
      write(`api/v1/datasets/${alias}.json`, stable({ id: alias, status: 'renamed', current_id: full.id, url: full.url, api_url: full.api_url }), { media_type: 'application/json', description: `Former id of ${full.id}` });
    }
  }
  const courseSummaries = courses.map((c) => courseSummary(c.full));
  write('api/v1/courses.json', stable(courseSummaries), { media_type: 'application/json', description: 'All courses offered in Taiwan, summary form' });
  write(
    'api/v1/courses.csv',
    toCsv(
      ['id', 'title_zh', 'title_en', 'university', 'department', 'category', 'relevance', 'level', 'languages', 'latest_term', 'instructors', 'freshness', 'url', 'api_url'],
      courseSummaries.map((c) => ({
        id: c.id,
        title_zh: c.title['zh-Hant'],
        title_en: c.title.en,
        university: c.university.id,
        department: c.department['zh-Hant'],
        category: c.category.id,
        relevance: c.relevance,
        level: c.level.id,
        languages: c.languages.map((l) => l.id),
        latest_term: c.latest.term ?? c.latest.start,
        instructors: c.latest.instructors.map((i) => i.name),
        freshness: c.freshness.id,
        url: c.url,
        api_url: c.api_url,
      })),
    ),
    { media_type: 'text/csv', description: 'All courses as CSV (UTF-8, no BOM)' },
  );
  for (const { full } of courses) write(`api/v1/courses/${full.id}.json`, stable(full), { media_type: 'application/json', description: `Course record: ${full.id}` });
  write('api/v1/wanted.json', stable(wanted.map((w) => w.entry)), { media_type: 'application/json', description: 'Wanted datasets (許願池), including ones since published (已收錄)' });
  write('api/v1/news.json', stable(news.map(({ body_md, ...n }) => ({ ...n, body_md }))), { media_type: 'application/json', description: 'News items, newest first' });
  write('api/v1/taxonomy.json', stable(taxonomy(vocab)), { media_type: 'application/json', description: 'Every controlled vocabulary with Mandarin and English labels' });
  write('api/v1/catalog.json', catalogText, { media_type: 'application/json', description: 'The search catalog the browser uses (records, aliases and the fold map)' });
  for (const f of readdirSync(schemaDir).filter((x) => x.endsWith('.schema.json')).sort()) {
    copyFileSync(path.join(schemaDir, f), path.join(mkdirP(path.join(out, 'api', 'v1', 'schema')), f));
    files.push({ path: `/api/v1/schema/${f}`, url: `${ORIGIN}/api/v1/schema/${f}`, media_type: 'application/schema+json', description: `JSON Schema: ${f.replace('.schema.json', '')}` });
  }

  const lastUpdated = [...published, ...withdrawn, ...courses].map((x) => x.full.updated).filter(Boolean).sort().at(-1) ?? today;
  const refreshed = courses.filter((c) => !c.full.historical).map((c) => c.full.provenance.reviewed).sort().at(-1) ?? null;
  const index = {
    api_version: API_VERSION,
    last_breaking_change: LAST_BREAKING_CHANGE,
    updated: lastUpdated,
    courses_refreshed: refreshed,
    site: { name: { 'zh-Hant': '台灣網絡科學教育', en: 'Network Science Education in Taiwan' }, url: `${ORIGIN}/` },
    metadata_license: {
      id: 'CC0-1.0',
      url: 'https://creativecommons.org/publicdomain/zero/1.0/',
      statement: { 'zh-Hant': '本站目錄的詮釋資料以 CC0 1.0 釋出；各資料集本身依其授權。', en: 'Catalog metadata is released under CC0 1.0; each dataset keeps its own license.' },
    },
    counts,
    guide: `${ORIGIN}/llms.txt`,
    files: files.sort((a, b) => a.path.localeCompare(b.path)),
  };
  write('api/v1/index.json', stable(index));

  // Page data for the prerender (not part of the API contract).
  write(
    '_data/home.json',
    stable({ counts, news: news.slice(0, 3).map(({ body_md, ...n }) => n), examples }),
  );
  write(
    '_data/routes.json',
    stable({
      datasets: [...published, ...withdrawn].map((f) => f.full.id),
      dataset_aliases: published.flatMap((f) => f.full.aliases.map((a) => ({ from: a, to: f.full.id }))),
      courses: courses.map((c) => c.full.id),
    }),
  );

  renderOutputs({ root, out, write, published, withdrawn, courses, news, wanted, index, vocab, today });

  log(
    `catalog build: ${counts.datasets} datasets (${counts.hosted} hosted), ${counts.wanted} wanted, ${counts.withdrawn} withdrawn, ${counts.courses} courses, ${news.length} news; catalog.json ${(gz / 1024).toFixed(1)} KB gz of the 150 KB budget; ${result.warnings.length} warnings`,
  );
  return { counts, files: index.files, warnings: result.warnings, catalogGz: gz };
}

function termSort(term) {
  const m = /^(\d+)-(1|2|S)$/.exec(term);
  return m ? Number(m[1]) * 2 + (m[2] === '1' ? 0 : m[2] === '2' ? 1 : 1.5) : 0;
}

function mkdirP(dir) {
  mkdirSync(dir, { recursive: true });
  return dir;
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function taxonomy(vocab) {
  const fromLabels = (group) => Object.entries(vocab.labels[group] ?? {}).map(([id, l]) => ({ id, ...l }));
  return {
    domains: vocab.domains,
    tags: vocab.tags,
    kinds: fromLabels('kinds'),
    properties: fromLabels('properties'),
    layers: fromLabels('layers'),
    temporal: fromLabels('temporal'),
    spatial: fromLabels('spatial'),
    ranking_data_types: fromLabels('ranking_data_type'),
    comparison_outcomes: fromLabels('comparison_outcome'),
    taiwan_relevance: fromLabels('taiwan_relevance'),
    personal_data: fromLabels('personal_data'),
    redistribution: fromLabels('redistribution'),
    license_classes: fromLabels('license_class'),
    licenses: vocab.licenses.map(({ attribution_template, ...l }) => l),
    formats: vocab.formats,
    wanted_status: fromLabels('wanted_status'),
    course_categories: fromLabels('course_category'),
    relevance: fromLabels('relevance'),
    offering_types: fromLabels('offering_type'),
    levels: fromLabels('level'),
    languages: fromLabels('language'),
    freshness: fromLabels('freshness'),
    universities: vocab.universities,
    concepts: vocab.concepts.concepts.map((c) => ({ id: c.id, 'zh-Hant': c['zh-Hant'], en: c.en, aliases: c.aliases })),
  };
}

function main() {
  const args = process.argv.slice(2);
  const opt = (name, fallback) => {
    const i = args.lastIndexOf(name);
    return i >= 0 ? args[i + 1] : fallback;
  };
  const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
  const root = path.resolve(opt('--root', repoRoot));
  const out = path.resolve(opt('--out', path.join(repoRoot, 'build', 'site')));
  try {
    buildSite({
      root,
      out,
      today: opt('--today', taipeiToday()),
      useGit: !args.includes('--no-git'),
      skipValidate: args.includes('--skip-validate'),
      baseRef: opt('--base-ref', 'origin/main'),
    });
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
