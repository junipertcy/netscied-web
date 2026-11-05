// The PII scan (researcher-registry spec, "Public person records contain only
// allowlisted fields"): no public file may contain something that looks like an
// email address or a Taiwanese phone number, other than the site's own contact
// addresses. Text is NFKC-normalized first, so full-width ＠ and digits count,
// and the usual obfuscations ([at], (at), dot) are caught (review of
// Milestone A, finding 7).

// Addresses the site itself publishes: the contact address, and the
// maintainer's own address on the archived /stat1021/ page (his decision).
export const SITE_ADDRESSES = new Set(['tcy@inferweave.com', 'tzuchi.yen@colorado.edu']);

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
// local [at] domain [dot] tld, local (at) domain dot tld, …
const OBFUSCATED = /([A-Za-z0-9._%+-]+)\s*[[(]\s*at\s*[\])]\s*([A-Za-z0-9-]+(?:(?:\s*\.\s*|\s*[[(]\s*dot\s*[\])]\s*|\s+dot\s+)[A-Za-z0-9-]+)+)/gi;
const PHONES = [
  // Mobile: 0912-345-678, 0912 345 678, 0912.345.678, 0912345678, +886 912 345 678
  /(?<![\d.-])(?:\+886[-\s.]?|0)9\d{2}[-\s.]?\d{3}[-\s.]?\d{3}(?![\d.-])/g,
  // Landline, with an area code of one to three digits after the 0, and 6 to 8
  // digits: 02-2345-6789, (02) 2345-6789, +886-2-2345-6789, 06-275-7575,
  // 037-381000, 089-517-000
  /(?<![\d.-])(?:\(0\d{1,3}\)\s?|(?:\+886[-\s.]?|0)[2-8]\d{0,2}[-\s.])\d{3,4}[-\s.]?\d{3,4}(?![\d.-])/g,
];

function canonical(text) {
  return text.normalize('NFKC').replace(/&#64;|&commat;|&#x40;/gi, '@');
}

export function findPii(input) {
  if (typeof input !== 'string') return [];
  const text = canonical(input);
  const hits = [];
  for (const m of text.matchAll(EMAIL)) {
    if (!SITE_ADDRESSES.has(m[0].toLowerCase())) hits.push({ kind: 'email', value: m[0] });
  }
  for (const m of text.matchAll(OBFUSCATED)) {
    const domain = m[2].replace(/\s*[[(]\s*dot\s*[\])]\s*|\s+dot\s+|\s*\.\s*/gi, '.');
    const address = `${m[1]}@${domain}`.toLowerCase();
    if (!SITE_ADDRESSES.has(address)) hits.push({ kind: 'email', value: m[0] });
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
