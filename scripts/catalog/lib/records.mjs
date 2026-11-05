// Checks on a single record: its schema, and its references into the
// vocabularies. Cross-file rules (ids.lock, manifests, people, news links)
// are in scripts/catalog/validate.mjs.
import path from 'node:path';
import { loadSchemas, schemaErrors } from './schemas.mjs';
import { licenseClass, OWN_WORK_LICENSES } from './licenses.mjs';

const RECOMMENDED_DATASET = [
  ['description.en', (r) => r.description?.en, 'an English description helps English searches and agents'],
  ['keywords', (r) => r.keywords?.length, 'keywords improve search'],
  ['coverage.temporal', (r) => r.coverage?.temporal, 'temporal coverage is shown in the table'],
  ['coverage.spatial', (r) => r.coverage?.spatial, 'spatial coverage goes into the JSON-LD'],
  ['creators', (r) => r.creators?.length, 'creators are credited on the page and in the citation'],
  ['references', (r) => r.references?.length, 'a reference lets users cite the original work'],
  ['license.evidence', (r) => r.license?.evidence, 'record where the license was checked, and when'],
];

export const SPDX_LIKE = /^(?!LicenseRef-)(?!NOASSERTION$)(?!NONE$)/;

export function checkLicense(record, vocab, err) {
  const id = record.license?.id;
  if (!id) return;
  if (!vocab.byId.licenses.has(id)) {
    err('license.id', `unknown license "${id}"; add it to catalog/vocab/licenses.yaml with its class`);
  }
  if (SPDX_LIKE.test(id) && !vocab.spdxIds.has(id)) {
    err('license.id', `"${id}" is not an id in the pinned SPDX License List ${vocab.spdx.licenseListVersion}`);
  }
  const basis = record.redistribution?.basis;
  const cls = licenseClass(id, vocab);
  if (basis === 'license-permits' && cls === 'link-only') {
    err('redistribution.basis', `license-permits needs a license that permits redistribution; ${id} is in class link-only`);
  }
  if (basis === 'own-work' && !OWN_WORK_LICENSES.has(id)) {
    err('license.id', `own-work records are released by the site under ${[...OWN_WORK_LICENSES].join(' or ')}`);
  }
}

export function checkDataset(record, file, { vocab }) {
  const errors = [];
  const warnings = [];
  const err = (field, message) => errors.push({ file, field, message });
  const warn = (field, message) => warnings.push({ file, field, message });
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    err('(record)', 'must be a YAML mapping');
    return { errors, warnings };
  }
  for (const e of schemaErrors(loadSchemas().dataset, record)) err(e.field, e.message);

  const base = path.basename(file, path.extname(file));
  if (record.id && record.id !== base) err('id', `"${record.id}" must equal the file name "${base}"`);

  (record.domains ?? []).forEach((d, i) => {
    if (!vocab.byId.domains.has(d)) err(`domains[${i}]`, `unknown domain "${d}"; use one of ${[...vocab.byId.domains.keys()].join(', ')}`);
  });
  (record.tags ?? []).forEach((t, i) => {
    if (!vocab.byId.tags.has(t)) err(`tags[${i}]`, `unknown tag "${t}"; add it to catalog/vocab/tags.yaml`);
  });
  (record.concepts ?? []).forEach((c, i) => {
    if (!vocab.byId.concepts.has(c)) err(`concepts[${i}]`, `unknown concept "${c}"`);
  });
  (record.provenance?.access ?? []).forEach((a, i) => {
    if (a.format && !vocab.byId.formats.has(a.format)) err(`provenance.access[${i}].format`, `unknown format "${a.format}"`);
  });
  const parts = record.structure?.partitions;
  if (parts && Array.isArray(parts.names) && parts.names.length !== parts.count) {
    err('structure.partitions.names', `lists ${parts.names.length} partitions but count is ${parts.count}`);
  }
  if (record.counts?.partitions && parts) {
    const ids = new Set(parts.names.map((p) => p.id));
    for (const k of Object.keys(record.counts.partitions)) {
      if (!ids.has(k)) err(`counts.partitions.${k}`, 'is not a partition id in structure.partitions');
    }
  }
  if (record.aliases?.includes(record.id)) err('aliases', 'must not contain the record id itself');
  checkLicense(record, vocab, err);

  const level = record.personal_data?.level;
  if (level === 'sensitive') {
    const access = record.provenance?.access ?? [];
    if (!access.length) err('provenance.access', 'a sensitive record must link to a controlled-access landing page');
    access.forEach((a, i) => {
      if (a.controlled_access !== true) {
        err(`provenance.access[${i}]`, 'a sensitive record may link only to controlled-access landing pages (set controlled_access: true for the access gate)');
      }
    });
  }

  if (record.status === 'published') {
    for (const [field, has, why] of RECOMMENDED_DATASET) if (!has(record)) warn(field, `recommended field missing (${why})`);
  }
  if (record.status === 'published' && record.wanted && !record.wanted.status) {
    // A published record keeps its wanted block for the 已收錄 row; nothing to check.
  }
  return { errors, warnings };
}

export function checkCourse(record, file, { vocab }) {
  const errors = [];
  const warnings = [];
  const err = (field, message) => errors.push({ file, field, message });
  const warn = (field, message) => warnings.push({ file, field, message });
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    err('(record)', 'must be a YAML mapping');
    return { errors, warnings };
  }
  for (const e of schemaErrors(loadSchemas().course, record)) {
    // Name the offering, so "Missing evidence" points at the term.
    const m = /^offerings\[(\d+)\]/.exec(e.field);
    const term = m ? record.offerings?.[Number(m[1])]?.term : undefined;
    err(e.field, term ? `${e.message} (offering ${term})` : e.message);
  }
  const base = path.basename(file, path.extname(file));
  if (record.id && record.id !== base) err('id', `"${record.id}" must equal the file name "${base}"`);
  if (record.university && !vocab.byId.universities.has(record.university)) {
    err('university', `unknown university "${record.university}"; add it to catalog/vocab/universities.yaml`);
  }
  const terms = new Map();
  (record.offerings ?? []).forEach((o, i) => {
    if (!o.term) return;
    if (terms.has(o.term)) warn(`offerings[${i}].term`, `term ${o.term} is listed twice`);
    terms.set(o.term, i);
  });
  if (!record.title?.en) warn('title.en', 'recommended field missing (English title)');
  if (!record.summary) warn('summary', 'recommended field missing (a maintainer-written summary)');
  return { errors, warnings };
}
