// The netscied.tw search core (design D4; site-search spec). The browser runs it
// on /search/ over /api/v1/catalog.json, and the build runs the same file for the
// gold-set gate (Node strips the types). Keep it free of DOM and Node APIs, and
// use only erasable TypeScript syntax so Node can run it as is.
import MiniSearch from 'minisearch';

export type Mode = 'datasets' | 'courses';
export type RecordType = 'dataset' | 'course' | 'wanted';

export interface NormalizeData {
  /** Traditional (and Taiwan-variant) character → Simplified fold, cut to the corpus. */
  fold: Record<string, string>;
  /** Phrase folds applied after the character fold, already folded. */
  phrases: [string, string][];
  /** Words that say nothing about which record is meant (folded). */
  generic: string[];
  /** Words removed from queries (folded, longest first). */
  fillers: string[];
  /** Phrases that mean computer networking (folded). */
  networking: string[];
  modeWords: { courses: string[]; datasets: string[] };
}

export interface SearchRecord {
  type: RecordType;
  id: string;
  url: string;
  status: string;
  title: { zh: string; en?: string };
  keywords: string[];
  aliases: string[];
  description: string;
  en: string;
  internet: boolean;
  domains: string[];
  kinds: string[];
  category?: string;
  university?: string;
  /**
   * University and department names (final review W3). Indexed for ranking only:
   * a match here never satisfies the coverage rule, so 交通 (in 陽明交通大學) does
   * not make a course about transport networks.
   */
  institution?: string[];
  /** Whole university names and short names (台大, 政大, 交大): a query naming one ranks that school first. */
  institutionNames?: string[];
  /** Score multiplier, below 1 for historical or dormant courses. Default 1. */
  boost?: number;
  display: Record<string, unknown>;
}

export interface CatalogFile {
  schema: number;
  normalize: NormalizeData;
  records: SearchRecord[];
}

export interface PreparedQuery {
  raw: string;
  /** The query after truncation to 100 characters. */
  text: string;
  truncated: boolean;
  /** Normalized, with Bopomofo, fillers and mode words removed. */
  cleaned: string;
  tokens: string[];
  specific: string[];
  /** Specific tokens that straddle the edge of a generic word (際網 in 人際網絡): never the only match. */
  cross: string[];
  /** Normalized university names the query contains (course mode). */
  institutions: string[];
  empty: boolean;
  genericOnly: boolean;
  networking: boolean;
  modeHint: Mode | null;
}

export interface Hit {
  id: string;
  type: RecordType;
  score: number;
  record: SearchRecord;
}

export interface SearchResult {
  mode: Mode;
  query: PreparedQuery;
  hits: Hit[];
  wanted: Hit[];
  browseAll: boolean;
  otherCount: number;
  hints: { networking: boolean; mode: Mode | null };
  facets: Record<string, Record<string, number>>;
}

export const MAX_QUERY_CHARS = 100;

// Han characters, plus the CJK compatibility and extension blocks NFKC leaves alone.
const HAN = /\p{Script=Han}/u;
const BOPOMOFO = /[㄀-ㄯㆠ-ㆿˊˇˋ˙]/gu;
const LATIN_WORD = /^[a-z][a-z0-9-]*$/;
const SPACE_BETWEEN_HAN = /(\p{Script=Han})\s+(?=\p{Script=Han})/gu;
const WORD = /[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*/gu;
// Query tokens that never mean a record (final review W6): a single Latin letter
// or digit, and the words of markup and script injection.
const JUNK = new Set(['script', 'javascript', 'alert', 'onerror', 'onload', 'iframe', 'img', 'src', 'href', 'http', 'https', 'www', 'html', 'svg']);
const isJunk = (t: string) => /^[a-z0-9]$/.test(t) || JUNK.has(t);

export function createNormalizer(data: NormalizeData) {
  const fold = data.fold;
  // Record text joins Han runs split by a space. A query keeps its spaces, so no
  // bigram crosses one (台大 社會網絡 has no 大社; final review W6).
  const normalize = (text: string, keepSpaces = false): string => {
    let s = (text ?? '').normalize('NFKC').toLowerCase();
    let out = '';
    for (const ch of s) out += fold[ch] ?? ch;
    s = keepSpaces ? out : out.replace(SPACE_BETWEEN_HAN, '$1');
    for (const [from, to] of data.phrases) s = s.split(from).join(to);
    return s;
  };
  // Tokens of text that is already normalized, with their positions: overlapping
  // bigrams over each run of Han characters (a lone character stays a unigram),
  // and Latin/other words. A hyphenated word is one token, plus its parts of
  // three or more letters (co-authorship → co-authorship, authorship).
  const tokenizeSpans = (s: string): Span[] => {
    const out: Span[] = [];
    for (const m of s.matchAll(WORD)) {
      const run = m[0];
      let han: { ch: string; i: number }[] = [];
      let latin = '';
      let latinStart = -1;
      const flushHan = () => {
        if (han.length === 1) out.push({ t: han[0].ch, start: han[0].i, end: han[0].i + han[0].ch.length });
        for (let k = 0; k + 1 < han.length; k++) out.push({ t: han[k].ch + han[k + 1].ch, start: han[k].i, end: han[k + 1].i + han[k + 1].ch.length });
        han = [];
      };
      const flushLatin = () => {
        const word = latin.replace(/^-+|-+$/g, '');
        if (word) {
          const at = latinStart + latin.indexOf(word);
          out.push({ t: word, start: at, end: at + word.length });
          if (word.includes('-')) {
            let off = at;
            for (const part of word.split('-')) {
              if (part.length >= 3) out.push({ t: part, start: off, end: off + part.length });
              off += part.length + 1;
            }
          }
        }
        latin = '';
        latinStart = -1;
      };
      let i = m.index ?? 0;
      for (const ch of run) {
        if (HAN.test(ch)) {
          flushLatin();
          han.push({ ch, i });
        } else {
          flushHan();
          if (latinStart < 0) latinStart = i;
          latin += ch;
        }
        i += ch.length;
      }
      flushHan();
      flushLatin();
    }
    return out;
  };
  const tokenizeNormalized = (s: string): string[] => tokenizeSpans(s).map((x) => x.t);
  const tokenize = (text: string): string[] => tokenizeNormalized(normalize(text));
  return { normalize, tokenize, tokenizeNormalized, tokenizeSpans };
}

interface Span {
  t: string;
  start: number;
  end: number;
}

const isLatinPhrase = (p: string) => !HAN.test(p);
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

// Positions of every occurrence of the phrases: Han phrases anywhere, Latin
// phrases as whole words.
function phraseRanges(s: string, phrases: string[]): [number, number][] {
  const ranges: [number, number][] = [];
  for (const p of phrases) {
    if (!p) continue;
    const re = isLatinPhrase(p)
      ? new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(p)}(?![\\p{L}\\p{N}])`, 'gu')
      : new RegExp(escapeRe(p), 'gu');
    for (const m of s.matchAll(re)) ranges.push([m.index ?? 0, (m.index ?? 0) + m[0].length]);
  }
  return ranges;
}

function strip(s: string, ranges: [number, number][]): string {
  const keep = new Array(s.length).fill(true);
  for (const [a, b] of ranges) for (let i = a; i < b; i++) keep[i] = false;
  // Ranges are UTF-16 indices (from RegExp), so work in code units too.
  return s.split('').map((c, i) => (keep[i] ? c : ' ')).join('');
}

export function prepareQuery(raw: string, mode: Mode, data: NormalizeData, institutionNames: string[] = []): PreparedQuery {
  const norm = createNormalizer(data);
  const rawText = typeof raw === 'string' ? raw : '';
  const chars = Array.from(rawText);
  const truncated = chars.length > MAX_QUERY_CHARS;
  const text = truncated ? chars.slice(0, MAX_QUERY_CHARS).join('') : rawText;

  const s = norm.normalize(text.replace(BOPOMOFO, ''), true);
  const networking = phraseRanges(s, data.networking).length > 0;
  const other: Mode = mode === 'datasets' ? 'courses' : 'datasets';
  const modeHint = phraseRanges(s, data.modeWords[other]).length > 0 ? other : null;

  // Filler and mode words are optional, never required to match. A token wholly
  // inside one is optional; a token outside every one is required (the coverage
  // rule counts it). Tokens that straddle an edge are optional too, unless the
  // query has characters that no required token covers: then stripping would
  // have cut a word (大數據, 目的地), and the straddling tokens are kept.
  // In course mode a university name is optional too: it ranks that school's
  // courses first instead of being matched as topic words (final review W3).
  const instRanges = mode === 'courses' ? phraseRanges(s, institutionNames) : [];
  const institutions = [...new Set(instRanges.map(([a, b]) => s.slice(a, b)))];
  const ranges = [...phraseRanges(s, [...data.modeWords.courses, ...data.modeWords.datasets, ...data.fillers]), ...instRanges];
  const covered = new Uint8Array(s.length);
  for (const [a, b] of ranges) covered.fill(1, a, b);
  const spans = norm.tokenizeSpans(s).filter((sp) => !isJunk(sp.t));
  const generic = new Set(data.generic.flatMap((g) => norm.tokenizeNormalized(g)));
  // Han generic words (网路) and the tokens that straddle their edges.
  const inGeneric = new Uint8Array(s.length);
  for (const [a, b] of phraseRanges(s, data.generic.map((g) => norm.normalize(g)).filter((g) => HAN.test(g)))) inGeneric.fill(1, a, b);
  const straddlesGeneric = (sp: Span) => {
    let n = 0;
    for (let i = sp.start; i < sp.end; i++) n += inGeneric[i];
    return n > 0 && n < sp.end - sp.start;
  };
  const count = (sp: Span) => {
    let n = 0;
    for (let i = sp.start; i < sp.end; i++) n += covered[i];
    return n;
  };
  const core = spans.filter((sp) => count(sp) === 0);
  const cross = spans.filter((sp) => {
    const n = count(sp);
    return n > 0 && n < sp.end - sp.start;
  });
  const inCore = new Uint8Array(s.length);
  for (const sp of core) inCore.fill(1, sp.start, sp.end);
  const orphan = (i: number) => !covered[i] && !inCore[i];
  let specificSpans = core.filter((sp) => !generic.has(sp.t));
  const genericCore = core.filter((sp) => generic.has(sp.t));
  if (!specificSpans.length && !genericCore.length) {
    specificSpans = cross.filter((sp) => {
      for (let i = sp.start; i < sp.end; i++) if (orphan(i)) return !generic.has(sp.t);
      return false;
    });
  }
  const tokens = [...new Set(spans.map((sp) => sp.t))];
  const specific = [...new Set(specificSpans.map((sp) => sp.t))];
  const straddling = [...new Set(specificSpans.filter(straddlesGeneric).map((sp) => sp.t))].filter((t) => !specificSpans.some((sp) => sp.t === t && !straddlesGeneric(sp)));
  return {
    raw: rawText,
    text,
    truncated,
    cleaned: norm.normalize(strip(s, ranges).replace(/\s+/g, ' ').trim()),
    tokens,
    specific,
    cross: straddling,
    institutions,
    empty: specific.length === 0 && genericCore.length === 0,
    genericOnly: specific.length === 0 && genericCore.length > 0,
    networking,
    modeHint,
  };
}

// True when a and b are at most one edit apart (insertion, deletion,
// substitution, or a swap of two adjacent letters).
export function oneEditApart(a: string, b: string): boolean {
  if (a === b) return true;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0;
  while (i < la && i < lb && a[i] === b[i]) i++;
  if (la === lb) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true;
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
  }
  return la > lb ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

const TYPE_FOR_MODE: Record<Mode, RecordType> = { datasets: 'dataset', courses: 'course' };
const BOOST = { title: 4, keywords: 2.5, aliases: 1.75, en: 1.5, description: 1, institution: 1 };
// A course of the school the query names ranks above the others (final review W3).
const INSTITUTION_BOOST = 3;

export function createSearch(catalog: CatalogFile) {
  const data = catalog.normalize;
  const norm = createNormalizer(data);
  const records = catalog.records.filter((r) => r.status === 'published' || r.type === 'wanted');
  const byId = new Map(records.map((r) => [`${r.type}:${r.id}`, r]));
  const index = new MiniSearch<Record<string, unknown>>({
    idField: 'key',
    fields: ['title', 'keywords', 'aliases', 'en', 'description', 'institution'],
    storeFields: ['type', 'boost'],
    tokenize: (text: string) => norm.tokenize(text),
    processTerm: (term: string) => term,
  });
  index.addAll(
    records.map((r) => ({
      key: `${r.type}:${r.id}`,
      type: r.type,
      boost: r.boost ?? 1,
      title: [r.title.zh, r.title.en ?? ''].join(' '),
      keywords: r.keywords.join(' '),
      aliases: r.aliases.join(' '),
      en: r.en,
      description: r.description,
      institution: (r.institution ?? []).join(' '),
    })),
  );
  // Normalized whole university names, and the records of each.
  const recordsByInstitution = new Map<string, Set<string>>();
  for (const r of records) {
    for (const n of r.institutionNames ?? []) {
      const key = norm.normalize(n);
      if (!recordsByInstitution.has(key)) recordsByInstitution.set(key, new Set());
      recordsByInstitution.get(key)!.add(`${r.type}:${r.id}`);
    }
  }
  const institutionNames = [...recordsByInstitution.keys()].sort((a, b) => b.length - a.length);
  const ofInstitutions = (q: PreparedQuery) => new Set(q.institutions.flatMap((n) => [...(recordsByInstitution.get(n) ?? [])]));

  // Every Latin word in the index, by first letter, for typo expansion.
  const latinByFirst = new Map<string, Set<string>>();
  const latinWords = new Set<string>();
  for (const r of records) {
    for (const t of norm.tokenize([r.title.zh, r.title.en ?? '', r.keywords.join(' '), r.aliases.join(' '), r.en, r.description].join(' '))) {
      if (!LATIN_WORD.test(t)) continue;
      latinWords.add(t);
      if (!latinByFirst.has(t[0])) latinByFirst.set(t[0], new Set());
      latinByFirst.get(t[0])!.add(t);
    }
  }
  // Rule 4, typo matching: a Latin word of six or more letters that is not in
  // the index also matches the indexed words one edit away that share its first
  // letter (citation never reaches station; hypergrahp reaches hypergraph).
  const expand = (tokens: string[]) => {
    const terms = new Map<string, string>();
    for (const t of tokens) {
      terms.set(t, t);
      // English plural and singular: routes also matches route, and the other way round.
      if (/^[a-z]{4,}$/.test(t)) {
        const other = t.endsWith('s') ? t.slice(0, -1) : `${t}s`;
        if (latinWords.has(other) && !terms.has(other)) terms.set(other, t);
      }
      if (!/^[a-z]{6,}$/.test(t) || latinWords.has(t)) continue;
      for (const w of latinByFirst.get(t[0]) ?? []) if (oneEditApart(t, w) && !terms.has(w)) terms.set(w, t);
    }
    return terms;
  };

  const run = (q: PreparedQuery, type: RecordType): Hit[] => {
    const named = ofInstitutions(q);
    const pool = records.filter((r) => r.type === type);
    // A query that only names a school lists that school's courses.
    if (q.empty) return named.size ? pool.filter((r) => named.has(`${r.type}:${r.id}`)).map((record, i, all) => ({ id: record.id, type, score: all.length - i, record })) : [];
    let hits: Hit[];
    if (q.genericOnly) {
      hits = pool.map((record, i) => ({ id: record.id, type, score: pool.length - i, record }));
    } else {
      // Rule 1, coverage: a hit must match a third of the required terms. Han
      // bigrams overlap and repeat each other; English words do not, so a query
      // made only of Latin words needs two thirds of them.
      const latinOnly = q.specific.every((t) => LATIN_WORD.test(t));
      const need = q.specific.length * (latinOnly ? 2 / 3 : 1 / 3);
      const specific = new Set(q.specific);
      const cross = new Set(q.cross);
      const anchored = q.specific.some((t) => !cross.has(t));
      const terms = expand(q.tokens);
      hits = index
        .search([...terms.keys()].join(' '), {
          tokenize: (t: string) => t.split(' ').filter(Boolean),
          processTerm: (t: string) => t,
          combineWith: 'OR',
          boost: BOOST,
          prefix: (term: string) => Array.from(term).length === 1 && HAN.test(term),
          fuzzy: false,
          filter: (res) => res['type'] === type,
          boostDocument: (_id: unknown, _term: string, stored?: Record<string, unknown>) => Number(stored?.['boost'] ?? 1),
        })
        .filter((res) => {
          // Matches in the university and department names never count (W3).
          const counted = Object.entries(res.match as Record<string, string[]>)
            .filter(([, fields]) => fields.some((f) => f !== 'institution'))
            .map(([t]) => terms.get(t) ?? t)
            .filter((t) => specific.has(t));
          const matched = new Set(counted);
          // A token straddling 網路 (際網) never makes a hit on its own (W6).
          if (anchored && ![...matched].some((t) => !cross.has(t))) return false;
          return matched.size >= need;
        })
        .map((res) => {
          const record = byId.get(String(res.id))!;
          const key = `${record.type}:${record.id}`;
          return { id: record.id, type, score: res.score * (named.has(key) ? INSTITUTION_BOOST : 1), record };
        });
    }
    // Computer-networking intent: in data mode only internet datasets stay; the
    // course catalog excludes computer-networking courses, so nothing stays there.
    if (q.networking && type === 'dataset') hits = hits.filter((h) => h.record.internet);
    if (q.networking && type === 'course') hits = [];
    return hits.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  };

  const facetsOf = (hits: Hit[], mode: Mode) => {
    const facets: Record<string, Record<string, number>> = {};
    const add = (facet: string, value: string | undefined) => {
      if (!value) return;
      facets[facet] = facets[facet] ?? {};
      facets[facet][value] = (facets[facet][value] ?? 0) + 1;
    };
    for (const h of hits) {
      if (mode === 'datasets') {
        h.record.domains.forEach((d) => add('domains', d));
        h.record.kinds.forEach((k) => add('kinds', k));
      } else {
        add('category', h.record.category);
        add('university', h.record.university);
      }
    }
    return facets;
  };

  const search = (raw: string, mode: Mode = 'datasets'): SearchResult => {
    const m: Mode = mode === 'courses' ? 'courses' : 'datasets';
    const q = prepareQuery(raw, m, data, institutionNames);
    const hits = run(q, TYPE_FOR_MODE[m]);
    const other: Mode = m === 'datasets' ? 'courses' : 'datasets';
    const otherQ = prepareQuery(raw, other, data, institutionNames);
    return {
      mode: m,
      query: q,
      hits,
      wanted: m === 'datasets' && !q.genericOnly ? run(q, 'wanted') : [],
      browseAll: q.genericOnly,
      otherCount: otherQ.genericOnly ? 0 : run(otherQ, TYPE_FOR_MODE[other]).length,
      hints: { networking: q.networking, mode: q.modeHint },
      facets: facetsOf(hits, m),
    };
  };

  return { search, normalizer: norm, size: records.length };
}
