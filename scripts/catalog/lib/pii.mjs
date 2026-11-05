// The PII scan (researcher-registry spec, "Public person records contain only
// allowlisted fields"): no public file may contain something that looks like an
// email address or a Taiwanese phone number, other than the site's own contact
// addresses.
export const SITE_ADDRESSES = new Set(['hi@netscied.tw']);

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const PHONES = [
  // Mobile: 0912-345-678, 0912 345 678, 0912345678, +886 912 345 678
  /(?<![\d-])(?:\+886[-\s]?|0)9\d{2}[-\s]?\d{3}[-\s]?\d{3}(?![\d-])/g,
  // Landline with separators: 02-2345-6789, (02) 2345-6789, +886-2-2345-6789, 06-275-7575
  /(?<![\d-])(?:\(0[2-8]\d?\)\s?|(?:\+886[-\s]?|0)[2-8]\d?[-\s])\d{3,4}[-\s]?\d{4}(?![\d-])/g,
];

export function findPii(text) {
  if (typeof text !== 'string') return [];
  const hits = [];
  for (const m of text.matchAll(EMAIL)) {
    if (!SITE_ADDRESSES.has(m[0].toLowerCase())) hits.push({ kind: 'email', value: m[0] });
  }
  for (const re of PHONES) for (const m of text.matchAll(re)) hits.push({ kind: 'phone', value: m[0] });
  return hits;
}

// Every string in a parsed record, with its field path.
export function* strings(value, field = '') {
  if (typeof value === 'string') yield [field || '(value)', value];
  else if (Array.isArray(value)) for (let i = 0; i < value.length; i++) yield* strings(value[i], `${field}[${i}]`);
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) yield* strings(v, field ? `${field}.${k}` : k);
  }
}

export function scanRecord(record) {
  const out = [];
  for (const [field, text] of strings(record)) for (const hit of findPii(text)) out.push({ field, ...hit });
  return out;
}
