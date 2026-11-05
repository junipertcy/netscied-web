// Validates the catalog (task 3.4; dataset-catalog, course-catalog,
// content-governance, researcher-registry and data-curation specs).
//
//   node scripts/catalog/validate.mjs [--root .] [--base-ref origin/main|none]
//                                     [--require-base] [--today YYYY-MM-DD]
//
// Errors fail the build; missing recommended fields only warn. Every message
// names the file and the field.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadCatalog, parseIdsLock } from './lib/load.mjs';
import { loadSchemas, schemaErrors } from './lib/schemas.mjs';
import { checkCourse, checkDataset } from './lib/records.mjs';
import { mayHost } from './lib/licenses.mjs';
import { scanRecord, findPii } from './lib/pii.mjs';
import { listAtRef, refExists, showAtRef } from './lib/git.mjs';

const DATA_ORIGIN = 'https://netscied.tw/data/';

// Today's date in Taiwan, the calendar the site's dates are written in.
export function taipeiToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

// 中國臺灣 / 中国台湾, "Taiwan, China" (as the whole value, so a list such as
// "Taiwan, China, Japan" passes), "Taiwan, Province of China", "China (Taiwan)".
const NON_NEUTRAL_TAIWAN = /中[國国]\s*[臺台][灣湾]|Taiwan\s*,\s*China\s*$|Taiwan\s*,?\s*\(?Province of China\)?|China\s*\(Taiwan\)/i;

export function validateCatalog({ root, baseRef = 'origin/main', requireBase = false, today = taipeiToday() }) {
  const cat = loadCatalog(root);
  const errors = [...cat.errors];
  const warnings = [];
  const err = (file, field, message) => errors.push({ file, field, message });
  const warn = (file, field, message) => warnings.push({ file, field, message });
  const { vocab } = cat;
  const schemas = loadSchemas();

  // --- Records on their own -------------------------------------------------
  for (const { file, data } of cat.datasets) {
    const r = checkDataset(data, file, { vocab });
    errors.push(...r.errors);
    warnings.push(...r.warnings);
  }
  for (const { file, data } of cat.courses) {
    const r = checkCourse(data, file, { vocab });
    errors.push(...r.errors);
    warnings.push(...r.warnings);
  }
  const people = new Map();
  for (const { file, data } of cat.people) {
    for (const e of schemaErrors(schemas.person, data)) err(file, e.field, e.message);
    const base = path.basename(file, '.yaml');
    if (data?.id && data.id !== base) err(file, 'id', `"${data.id}" must equal the file name "${base}"`);
    if (data?.id) people.set(data.id, data);
  }

  // --- Identifiers ------------------------------------------------------------
  const datasetIds = new Map();
  const courseIds = new Map();
  const claim = (map, id, file, field) => {
    if (map.has(id)) err(file, field, `"${id}" is already used by ${map.get(id)}`);
    else map.set(id, file);
  };
  for (const { file, data } of cat.datasets) {
    if (data?.id) claim(datasetIds, data.id, file, 'id');
  }
  for (const { file, data } of cat.datasets) {
    (data?.aliases ?? []).forEach((a, i) => claim(datasetIds, a, file, `aliases[${i}]`));
  }
  for (const { file, data } of cat.courses) if (data?.id) claim(courseIds, data.id, file, 'id');
  for (const { file, data } of cat.courses) (data?.aliases ?? []).forEach((a, i) => claim(courseIds, a, file, `aliases[${i}]`));

  if (cat.idsLock) {
    const lockFile = cat.idsLock.file;
    const lock = parseIdsLock(cat.idsLock.text);
    for (const m of lock.malformed) err(lockFile, `line ${m.line}`, `cannot parse "${m.text}"; lines are "<dataset|course> <id> <YYYY-MM-DD>"`);
    const locked = new Map();
    for (const e of lock.entries) {
      const key = `${e.kind} ${e.id}`;
      if (locked.has(key)) err(lockFile, `line ${e.line}`, `${key} is listed twice`);
      locked.set(key, e);
    }
    const lockedAliases = new Set(lock.aliases.map((a) => `${a.from}`));
    const checkLocked = (kind, records) => {
      const owners = new Set();
      for (const { file, data } of records) {
        if (!data?.id) continue;
        owners.add(data.id);
        const e = locked.get(`${kind} ${data.id}`);
        if (!e) err(file, 'id', `"${data.id}" is not in catalog/ids.lock; append "${kind} ${data.id} ${data.added ?? data.provenance?.added ?? 'YYYY-MM-DD'}"`);
        else {
          const added = kind === 'dataset' ? data.added : data.provenance?.added;
          if (added && e.added !== added) {
            err(file, 'id', `"${data.id}" was issued on ${e.added} (ids.lock line ${e.line}) to a record added on that date; this record says ${added}, so the identifier would be reused. Identifiers are never reused`);
          }
        }
        (data.aliases ?? []).forEach((a, i) => {
          owners.add(a);
          if (!locked.has(`${kind} ${a}`) && !lockedAliases.has(a)) err(file, `aliases[${i}]`, `"${a}" is not in catalog/ids.lock`);
        });
      }
      for (const e of lock.entries.filter((x) => x.kind === kind)) {
        if (!owners.has(e.id)) {
          err(lockFile, `line ${e.line}`, `${kind} "${e.id}" was issued but has no record; a withdrawn ${kind} keeps its file as a tombstone`);
        }
      }
    };
    // Every `alias <old> <new>` line names a record <new> that lists <old> in its aliases.
    const aliasOwner = new Map();
    for (const { data } of [...cat.datasets, ...cat.courses]) for (const a of data?.aliases ?? []) aliasOwner.set(a, data.id);
    for (const a of lock.aliases) {
      const owner = aliasOwner.get(a.from);
      if (owner === undefined) err(lockFile, `line ${a.line}`, `alias "${a.from}" → "${a.to}", but no record lists "${a.from}" in its aliases`);
      else if (owner !== a.to) err(lockFile, `line ${a.line}`, `alias "${a.from}" → "${a.to}", but "${a.from}" is an alias of "${owner}"`);
    }
    checkLocked('dataset', cat.datasets);
    checkLocked('course', cat.courses);
  }

  // --- Version manifests --------------------------------------------------------
  const manifestsById = new Map();
  for (const v of cat.versions) {
    const m = v.data;
    for (const e of schemaErrors(schemas.version, m)) err(v.file, e.field, e.message);
    if (m.dataset !== v.dir) err(v.file, 'dataset', `"${m.dataset}" must equal the folder name "${v.dir}"`);
    if (m.version !== v.name) err(v.file, 'version', `"${m.version}" must equal the file name "${v.name}"`);
    (m.files ?? []).forEach((f, i) => {
      const expected = `${DATA_ORIGIN}${v.dir}/${v.name}/${f.path}`;
      if (f.url !== expected) err(v.file, `files[${i}].url`, `must be ${expected}`);
      if (f.format && !vocab.byId.formats.has(f.format)) err(v.file, `files[${i}].format`, `unknown format "${f.format}"`);
    });
    if (!datasetIds.has(v.dir)) err(v.file, 'dataset', `no dataset record "${v.dir}" in catalog/datasets`);
    if (!manifestsById.has(v.dir)) manifestsById.set(v.dir, []);
    manifestsById.get(v.dir).push(v);
  }

  // --- Cross-record rules for datasets -------------------------------------------
  for (const { file, data: r } of cat.datasets) {
    if (!r?.id) continue;
    const manifests = manifestsById.get(r.id) ?? [];
    const hosted = manifests.length > 0;
    const level = r.personal_data?.level;
    if (hosted && r.status === 'wanted') err(file, 'status', 'a wanted record cannot have hosted versions; publish it first');
    if (hosted && r.counts) err(file, 'counts', 'counts for hosted datasets come from the version manifest; remove them from the record');
    if (hosted && r.redistribution?.basis === 'link-only') err(file, 'redistribution.basis', 'a link-only record cannot have hosted versions in catalog/versions');
    if (hosted && (level === 'private-individuals' || level === 'sensitive')) {
      err(file, 'personal_data.level', `a ${level} record cannot have hosted files (content-governance spec)`);
    } else if (hosted && r.status === 'published' && r.license && !mayHost(r, vocab)) {
      err(file, 'license.id', `the license class of ${r.license.id} does not permit hosting`);
    }
    // Final review D3: a hosted record covers no more than its live versions do.
    const live = manifests.filter((v) => !v.data.withdrawn);
    if (hosted && r.status === 'published' && live.length) {
      const missing = live.filter((v) => !v.data.coverage?.temporal);
      for (const v of missing) err(v.file, 'coverage', 'a hosted version states the time span of its data (coverage.temporal start and end)');
      const t = r.coverage?.temporal;
      if (!missing.length && t) {
        const lo = (d) => d.padEnd(10, d.length === 4 ? '-01-01' : '-01');
        const hi = (d) => (d.length === 4 ? `${d}-12-31` : d.length === 7 ? `${d}-31` : d);
        const start = live.map((v) => lo(v.data.coverage.temporal.start)).sort()[0];
        const end = live.map((v) => hi(v.data.coverage.temporal.end)).sort().at(-1);
        if (t.ongoing) err(file, 'coverage.temporal.ongoing', 'a hosted record covers its versions, which are fixed; say in coverage.temporal.note that upstream continues');
        if (t.start && lo(t.start) < start) err(file, 'coverage.temporal.start', `${t.start} is before the hosted versions begin (${live.map((v) => v.data.coverage.temporal.start).sort()[0]})`);
        if (t.end && hi(t.end) > end) err(file, 'coverage.temporal.end', `${t.end} is after the hosted versions end`);
      }
    }
    if (r.status === 'withdrawn') {
      for (const v of manifests) {
        if (!v.data.withdrawn) err(file, 'status', `the record is withdrawn but ${v.file} still lists live files; add "withdrawn" to that manifest`);
      }
    }
    // Neutral naming (task 12.5): Taiwan is not described as part of the PRC.
    for (const [lang, v] of Object.entries(r.coverage?.spatial ?? {})) {
      if (NON_NEUTRAL_TAIWAN.test(String(v))) err(file, `coverage.spatial.${lang}`, `"${v}" names Taiwan as part of China; write 臺灣 / Taiwan (or the place itself)`);
    }
    (r.creators ?? []).forEach((c, i) => {
      if (c.person && !people.has(c.person)) err(file, `creators[${i}].person`, `unknown person "${c.person}"; no catalog/people/${c.person}.yaml`);
    });
    if (r.personal_data?.reviewed_on && r.personal_data.reviewed_on > today) {
      err(file, 'personal_data.reviewed_on', `${r.personal_data.reviewed_on} is in the future`);
    }
    if (r.license?.evidence?.checked_on > today) err(file, 'license.evidence.checked_on', 'is in the future');
    (r.related?.datasets ?? []).forEach((id, i) => {
      if (!datasetIds.has(id)) err(file, `related.datasets[${i}]`, `unknown dataset "${id}"`);
    });
    (r.related?.courses ?? []).forEach((id, i) => {
      if (!courseIds.has(id)) err(file, `related.courses[${i}]`, `unknown course "${id}"`);
    });
  }
  for (const { file, data: c } of cat.courses) {
    (c?.offerings ?? []).forEach((o, i) => {
      if (o.verified_on > today) err(file, `offerings[${i}].verified_on`, `${o.verified_on} is in the future`);
    });
  }

  // --- News -------------------------------------------------------------------
  const anchors = new Map();
  for (const n of cat.news) {
    if (!n.data) continue;
    for (const e of schemaErrors(schemas.news, n.data)) err(n.file, e.field, e.message);
    const { id, date } = n.data;
    if (id && date && !id.startsWith(`${date}-`)) err(n.file, 'id', `"${id}" must start with the item date ${date}`);
    if (id) {
      if (anchors.has(id)) err(n.file, 'id', `duplicate news anchor "${id}" (also in ${anchors.get(id)})`);
      else anchors.set(id, n.file);
    }
    (n.data.related?.datasets ?? []).forEach((d, i) => {
      if (!datasetIds.has(d)) err(n.file, `related.datasets[${i}]`, `unknown dataset "${d}"`);
    });
    (n.data.related?.courses ?? []).forEach((c, i) => {
      if (!courseIds.has(c)) err(n.file, `related.courses[${i}]`, `unknown course "${c}"`);
    });
    if (!n.body.trim()) err(n.file, '(body)', 'the Mandarin body is empty');
  }

  // --- Recipes ----------------------------------------------------------------
  for (const { file, data } of cat.recipes) {
    for (const e of schemaErrors(schemas.recipe, data)) err(file, e.field, e.message);
    if (data?.dataset && !datasetIds.has(data.dataset)) err(file, 'dataset', `unknown dataset "${data.dataset}"`);
    // A manual source is committed under curation/inputs/ and only verified
    // against its recorded hash and size, never fetched again.
    (data?.sources ?? []).forEach((src, i) => {
      if (src.method !== 'manual' || !src.file) return;
      const input = path.join(root, 'curation', 'inputs', src.file);
      if (!existsSync(input)) {
        err(file, `sources[${i}].file`, `the manual source curation/inputs/${src.file} is missing`);
        return;
      }
      const bytes = readFileSync(input);
      const sha = createHash('sha256').update(bytes).digest('hex');
      if (src.expected && (sha !== src.expected.sha256 || bytes.length !== src.expected.bytes)) {
        err(file, `sources[${i}]`, `curation/inputs/${src.file} has SHA-256 ${sha} and ${bytes.length} bytes, but the recipe records ${src.expected.sha256} and ${src.expected.bytes}`);
      }
    });
  }

  // --- International and rejected course lists ------------------------------------
  if (cat.international?.data) for (const e of schemaErrors(schemas.international, cat.international.data)) err(cat.international.file, e.field, e.message);
  if (cat.rejected?.data) {
    for (const e of schemaErrors(schemas.rejected, cat.rejected.data)) err(cat.rejected.file, e.field, e.message);
    (cat.rejected.data ?? []).forEach((r, i) => {
      if (r.university && !vocab.byId.universities.has(r.university)) err(cat.rejected.file, `[${i}].university`, `unknown university "${r.university}"`);
    });
  }

  // --- PII scan over every public text -------------------------------------------
  const scan = (file, record) => {
    for (const hit of scanRecord(record)) err(file, hit.field, `looks like ${hit.kind === 'email' ? 'an email address' : 'a phone number'} ("${hit.value}"); public files must not hold contact details`);
  };
  for (const group of [cat.datasets, cat.courses, cat.people, cat.versions]) for (const { file, data } of group) scan(file, data);
  for (const n of cat.news) {
    if (n.data) scan(n.file, n.data);
    for (const hit of findPii(n.body)) err(n.file, '(body)', `looks like ${hit.kind === 'email' ? 'an email address' : 'a phone number'} ("${hit.value}")`);
  }
  for (const extra of [cat.international, cat.rejected]) if (extra?.data) scan(extra.file, extra.data);

  // --- History: immutable manifests, append-only ids.lock --------------------------
  if (baseRef && baseRef !== 'none') {
    if (!refExists(root, baseRef)) {
      (requireBase ? errors : warnings).push({
        file: '(git)',
        field: baseRef,
        message: `base ref not found, so manifest immutability and the append-only ids.lock were not checked${requireBase ? '' : ' (CI runs with --require-base and fetch-depth: 0)'}`,
      });
    } else {
      const current = new Map(cat.versions.map((v) => [v.file, v.data]));
      for (const p of listAtRef(root, baseRef, 'catalog/versions').filter((f) => f.endsWith('.json'))) {
        const before = JSON.parse(showAtRef(root, baseRef, p) ?? 'null');
        const now = current.get(p);
        if (!now) {
          err(p, '(file)', `was published on ${baseRef} and is immutable; a takedown keeps the manifest and adds "withdrawn"`);
          continue;
        }
        const a = structuredClone(before);
        const b = structuredClone(now);
        if (a.doi == null && typeof b.doi === 'string') {
          // A DOI may be added once minted, whether the manifest had "doi": null or no key.
          if ('doi' in a) b.doi = a.doi;
          else delete b.doi;
        }
        delete a.suspended;
        delete b.suspended;
        if (!a.withdrawn) delete b.withdrawn;
        if (!isDeepStrictEqual(a, b)) {
          err(p, '(manifest)', `is immutable once on ${baseRef}; only "doi", "suspended" and "withdrawn" may be added. Publish a new version instead`);
        }
      }
      const beforeLock = showAtRef(root, baseRef, 'catalog/ids.lock');
      if (beforeLock !== null && cat.idsLock) {
        const lines = (t) => t.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
        const old = lines(beforeLock);
        const cur = lines(cat.idsLock.text);
        if (!old.every((l, i) => cur[i] === l)) {
          err(cat.idsLock.file, '(file)', `is append-only: the lines on ${baseRef} must stay, in order, at the top`);
        }
      }
    }
  }

  return { errors, warnings, catalog: cat };
}

export function formatIssue(kind, i) {
  return `${kind}: ${i.file}: ${i.field}: ${i.message}`;
}

function main() {
  const args = process.argv.slice(2);
  // The last occurrence of a flag wins.
  const opt = (name, fallback) => {
    const i = args.lastIndexOf(name);
    return i >= 0 ? args[i + 1] : fallback;
  };
  const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
  const root = path.resolve(opt('--root', repoRoot));
  const result = validateCatalog({
    root,
    baseRef: opt('--base-ref', 'origin/main'),
    requireBase: args.includes('--require-base'),
    today: opt('--today', taipeiToday()),
  });
  for (const w of result.warnings) console.log(formatIssue('warning', w));
  for (const e of result.errors) console.error(formatIssue('error', e));
  const c = result.catalog;
  console.log(
    `catalog: ${c.datasets.length} datasets, ${c.courses.length} courses, ${c.versions.length} versions, ${c.people.length} people, ${c.news.length} news; ${result.errors.length} errors, ${result.warnings.length} warnings`,
  );
  process.exit(result.errors.length ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
