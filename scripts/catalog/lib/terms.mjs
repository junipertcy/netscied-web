// 學年度 and 學期 (course-catalog spec; 各級學校學生學年學期假期辦法 §2–3):
// 學年度 N runs 1 Aug (N+1911) – 31 Jul (N+1912); semester 1 is Aug–Jan,
// semester 2 is Feb–Jul, and S is the summer session.

export function parseTerm(term) {
  const m = /^(\d{2,3})-(1|2|S)$/.exec(term ?? '');
  return m ? { year: Number(m[1]), sem: m[2] } : null;
}

// The regular term a calendar date (YYYY-MM-DD) falls in.
export function termOfDate(date) {
  const [y, mo] = date.split('-').map(Number);
  if (mo >= 8) return `${y - 1911}-1`;
  if (mo === 1) return `${y - 1912}-1`;
  return `${y - 1912}-2`;
}

// Position on the regular-term axis; a summer term sits just after semester 2.
export function termIndex(term) {
  const t = parseTerm(term);
  if (!t) return Number.NEGATIVE_INFINITY;
  return t.year * 2 + (t.sem === '1' ? 0 : t.sem === '2' ? 1 : 1.5);
}

// 「114-1（2025 秋）」, 「114-2（2026 春）」, 「114-S（2026 夏）」.
export function termLabel(term) {
  const t = parseTerm(term);
  if (!t) return term;
  if (t.sem === '1') return `${term}（${t.year + 1911} 秋）`;
  if (t.sem === '2') return `${term}（${t.year + 1912} 春）`;
  return `${term}（${t.year + 1912} 夏）`;
}

export function termLabelEn(term) {
  const t = parseTerm(term);
  if (!t) return term;
  if (t.sem === '1') return `${term} (fall ${t.year + 1911})`;
  if (t.sem === '2') return `${term} (spring ${t.year + 1912})`;
  return `${term} (summer ${t.year + 1912})`;
}

// 114 學年度暑期 (2026 夏) for a summer term, as the spec's example shows.
export function termLongLabel(term) {
  const t = parseTerm(term);
  if (t?.sem === 'S') return `${t.year} 學年度暑期（${t.year + 1912} 夏）`;
  return termLabel(term);
}

// Freshness of a course from its latest offering, relative to the current term:
// current, recent (1–4 regular terms ago), dormant (5 or more), or historical.
// Summer terms do not count toward the four: a summer term counts as its
// semester 2. An offering listed ahead of time (a future term) counts as recent.
export function freshness(latestTerm, currentTerm, { historical = false } = {}) {
  if (historical) return 'historical';
  const cur = termIndex(currentTerm);
  const t = parseTerm(latestTerm);
  if (!t) return 'dormant';
  const latest = t.year * 2 + (t.sem === '1' ? 0 : 1);
  const d = cur - latest;
  if (d === 0) return 'current';
  if (d <= 4) return 'recent';
  return 'dormant';
}
