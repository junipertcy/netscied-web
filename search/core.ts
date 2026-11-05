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
const SPACE_BETWEEN_HAN = /(\p{Script=Han})\s+(?=\p{Script=Han})/gu;
const WORD = /[\p{L}\p{N}]+/gu;

export function createNormalizer(data: NormalizeData) {
  const fold = data.fold;
  const normalize = (text: string): string => {
    let s = (text ?? '').normalize('NFKC').toLowerCase();
    let out = '';
    for (const ch of s) out += fold[ch] ?? ch;
    s = out.replace(SPACE_BETWEEN_HAN, '$1');
    for (const [from, to] of data.phrases) s = s.split(from).join(to);
    return s;
  };
  // Tokens of text that is already normalized: overlapping bigrams over each run
  // of Han characters (a lone character stays a unigram), and Latin/other words.
  const tokenizeNormalized = (s: string): string[] => {
    const tokens: string[] = [];
    for (const m of s.matchAll(WORD)) {
      const run = m[0];
      let han: string[] = [];
      let latin = '';
      const flushHan = () => {
        if (han.length === 1) tokens.push(han[0]);
        for (let i = 0; i + 1 < han.length; i++) tokens.push(han[i] + han[i + 1]);
        han = [];
      };
      const flushLatin = () => {
        if (latin) tokens.push(latin);
        latin = '';
      };
      for (const ch of run) {
        if (HAN.test(ch)) {
          flushLatin();
          han.push(ch);
        } else {
          flushHan();
          latin += ch;
        }
      }
      flushHan();
      flushLatin();
    }
    return tokens;
  };
  const tokenize = (text: string): string[] => tokenizeNormalized(normalize(text));
  return { normalize, tokenize, tokenizeNormalized };
}

const isLatinPhrase = (p: string) => !HAN.test(p);
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

// Removes each phrase from s: Han phrases anywhere, Latin phrases as whole words.
function removePhrases(s: string, phrases: string[]): { text: string; found: boolean } {
  let found = false;
  for (const p of phrases) {
    if (!p) continue;
    if (isLatinPhrase(p)) {
      const re = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(p)}(?=$|[^\\p{L}\\p{N}])`, 'gu');
      if (re.test(s)) {
        found = true;
        s = s.replace(re, '$1 ');
      }
    } else if (s.includes(p)) {
      found = true;
      s = s.split(p).join(' ');
    }
  }
  return { text: s, found };
}

function containsPhrase(s: string, phrases: string[]): boolean {
  return phrases.some((p) => {
    if (!p) return false;
    if (!isLatinPhrase(p)) return s.includes(p);
    return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(p)}($|[^\\p{L}\\p{N}])`, 'u').test(s);
  });
}

export function prepareQuery(raw: string, mode: Mode, data: NormalizeData): PreparedQuery {
  const norm = createNormalizer(data);
  const rawText = typeof raw === 'string' ? raw : '';
  const chars = Array.from(rawText);
  const truncated = chars.length > MAX_QUERY_CHARS;
  const text = truncated ? chars.slice(0, MAX_QUERY_CHARS).join('') : rawText;

  let s = norm.normalize(text.replace(BOPOMOFO, ''));
  const networking = containsPhrase(s, data.networking);
  const other: Mode = mode === 'datasets' ? 'courses' : 'datasets';
  const otherWords = removePhrases(s, data.modeWords[other]);
  s = otherWords.text;
  s = removePhrases(s, data.modeWords[mode]).text;
  s = removePhrases(s, data.fillers).text;
  const cleaned = norm.normalize(s.replace(/\s+/g, ' ').trim());

  const tokens = [...new Set(norm.tokenizeNormalized(cleaned))];
  const generic = new Set(data.generic.flatMap((g) => norm.tokenizeNormalized(g)));
  const specific = tokens.filter((t) => !generic.has(t));
  return {
    raw: rawText,
    text,
    truncated,
    cleaned,
    tokens,
    specific,
    empty: tokens.length === 0,
    genericOnly: tokens.length > 0 && specific.length === 0,
    networking,
    modeHint: otherWords.found ? other : null,
  };
}

const TYPE_FOR_MODE: Record<Mode, RecordType> = { datasets: 'dataset', courses: 'course' };
const BOOST = { title: 4, keywords: 2.5, aliases: 1.75, en: 1.5, description: 1 };

export function createSearch(catalog: CatalogFile) {
  const data = catalog.normalize;
  const norm = createNormalizer(data);
  const records = catalog.records.filter((r) => r.status === 'published' || r.type === 'wanted');
  const byId = new Map(records.map((r) => [`${r.type}:${r.id}`, r]));
  const index = new MiniSearch<Record<string, unknown>>({
    idField: 'key',
    fields: ['title', 'keywords', 'aliases', 'en', 'description'],
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
    })),
  );

  const run = (q: PreparedQuery, type: RecordType): Hit[] => {
    if (q.empty) return [];
    const pool = records.filter((r) => r.type === type);
    let hits: Hit[];
    if (q.genericOnly) {
      hits = pool.map((record, i) => ({ id: record.id, type, score: pool.length - i, record }));
    } else {
      const need = q.specific.length / 3;
      const specific = new Set(q.specific);
      hits = index
        .search(q.tokens.join(' '), {
          tokenize: (t: string) => t.split(' ').filter(Boolean),
          processTerm: (t: string) => t,
          combineWith: 'OR',
          boost: BOOST,
          prefix: (term: string) => Array.from(term).length === 1 && HAN.test(term),
          fuzzy: (term: string) => (/^[a-z]{6,}$/.test(term) ? 0.2 : false),
          filter: (res) => res['type'] === type,
          boostDocument: (_id: unknown, _term: string, stored?: Record<string, unknown>) => Number(stored?.['boost'] ?? 1),
        })
        .filter((res) => res.queryTerms.filter((t) => specific.has(t)).length >= need)
        .map((res) => {
          const record = byId.get(String(res.id))!;
          return { id: record.id, type, score: res.score, record };
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
    const q = prepareQuery(raw, m, data);
    const hits = run(q, TYPE_FOR_MODE[m]);
    const other: Mode = m === 'datasets' ? 'courses' : 'datasets';
    const otherQ = prepareQuery(raw, other, data);
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
