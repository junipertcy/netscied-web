// License classes (design D3; data-curation spec, "License classes decide
// permitted operations"). The class comes from catalog/vocab/licenses.yaml;
// an id not listed there counts as link-only.
export const HOSTABLE_CLASSES = new Set(['permissive', 'share-alike', 'non-commercial', 'no-derivatives']);

export function licenseClass(id, vocab) {
  return vocab.byId.licenses.get(id)?.class ?? 'link-only';
}

// The class that governs what the site may do with a record's data: the
// license's class, unless a written permission or the site's own compilation
// overrides it.
export function effectiveClass(record, vocab) {
  const basis = record.redistribution?.basis;
  if (basis === 'written-permission') return 'permission';
  if (basis === 'own-work') return 'permissive';
  if (basis === 'link-only') return 'link-only';
  return licenseClass(record.license?.id, vocab);
}

// Whether the site may host files for a record, after the personal-data
// override (content-governance spec: the personal-data level always wins).
export function mayHost(record, vocab) {
  const level = record.personal_data?.level;
  if (level === 'private-individuals' || level === 'sensitive') return false;
  const cls = effectiveClass(record, vocab);
  return cls === 'permission' || HOSTABLE_CLASSES.has(cls);
}

// The licenses the site's own compilations are released under.
export const OWN_WORK_LICENSES = new Set(['CC-BY-4.0', 'CC0-1.0']);
