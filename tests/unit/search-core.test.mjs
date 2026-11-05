// Task 6.1 — the search core (search/core.ts), the same code the browser and the
// gold-set gate run. One test per normalization step and query rule.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createSearch, createNormalizer, prepareQuery } from '../../search/core.ts';
import { makeNormalizeData } from '../../scripts/search/normalize-data.mjs';
import { readYaml } from '../../scripts/catalog/lib/yaml.mjs';
import { repoRoot } from '../../scripts/catalog/lib/schemas.mjs';

const concepts = readYaml(path.join(repoRoot, 'catalog', 'vocab', 'concepts.yaml')).data;

const rec = (over) => ({
  type: 'dataset',
  status: 'published',
  url: `/datasets/${over.id}/`,
  keywords: [],
  aliases: [],
  description: '',
  en: '',
  internet: false,
  domains: [],
  kinds: ['graph'],
  title: { zh: over.id, en: '' },
  display: {},
  ...over,
});

const RECORDS = [
  rec({ id: 'metro', title: { zh: '臺北捷運起訖站旅次', en: 'Taipei MRT origin–destination trips' }, aliases: ['捷運', 'MRT', 'metro', '地鐵', '旅次', '客流'], domains: ['transport'], description: '臺北捷運各站之間每月的旅次數。' }),
  rec({ id: 'metro-mention', title: { zh: '公共自行車站點', en: 'Bike stations' }, domains: ['transport'], description: '這份資料和捷運站的位置有關，描述自行車站點之間的騎乘。' }),
  rec({ id: 'ly', title: { zh: '立法院第10屆法案連署超圖', en: 'Legislative Yuan co-sponsorship hypergraph' }, kinds: ['hypergraph'], aliases: ['超圖', 'hypergraph', '立委', '連署', 'cosponsorship', 'legislator'], domains: ['politics'], description: '每個法案的提案人與連署人構成一條超邊。' }),
  rec({ id: 'film', title: { zh: '第55屆金馬獎入圍者–電影網絡', en: '55th Golden Horse Awards nominee–film network' }, aliases: ['二分網絡', 'bipartite', '電影', '金馬獎', 'film'], domains: ['culture'], description: '入圍者與影片之間的二分網絡。' }),
  rec({ id: 'twnic', title: { zh: 'TWNIC 連線頻寬網絡', en: 'TWNIC inter-network bandwidth network' }, aliases: ['網際網路', 'internet', '頻寬', 'bandwidth', 'internet topology'], internet: true, domains: ['technology'], description: '臺灣各網路之間登錄的連線頻寬。' }),
  rec({ id: 'gone', status: 'withdrawn', title: { zh: '已下架的捷運資料', en: 'Withdrawn metro data' }, aliases: ['捷運'] }),
  rec({ id: 'migration', type: 'wanted', status: 'wanted', url: '/wanted/#migration', title: { zh: '人口遷徙網絡', en: '' }, aliases: ['遷徙', 'migration'], domains: ['society'], description: '縣市之間的人口遷入與遷出。' }),
  rec({ id: 'sna-course', type: 'course', url: '/courses/sna-course/', title: { zh: '社會網絡分析', en: 'Social Network Analysis' }, aliases: ['社會網絡分析', 'social network analysis', 'sna'], kinds: [], description: '' }),
  rec({ id: 'gt-course', type: 'course', url: '/courses/gt-course/', title: { zh: '圖論', en: 'Graph Theory' }, aliases: ['圖論', 'graph theory'], kinds: [], description: '' }),
];

const corpus = RECORDS.flatMap((r) => [r.title.zh, r.title.en, r.description, ...r.aliases, ...r.keywords]);
const normalize = makeNormalizeData(concepts, corpus);
const catalog = { schema: 1, normalize, records: RECORDS };
const search = createSearch(catalog);
const norm = createNormalizer(normalize);
const ids = (res) => res.hits.map((h) => h.id);

test('normalization: NFKC, lowercase, Traditional→Simplified fold, 臺≡台, 網絡≡網路', () => {
  assert.equal(norm.normalize('ＭＲＴ'), 'mrt');
  assert.equal(norm.normalize('臺北捷運'), norm.normalize('台北捷运'));
  assert.equal(norm.normalize('網絡'), norm.normalize('網路'));
  assert.equal(norm.normalize(norm.normalize('臺北捷運網絡')), norm.normalize('臺北捷運網絡'));
});

test('normalization ignores spaces between Chinese characters', () => {
  assert.equal(norm.normalize('台北 捷運'), norm.normalize('台北捷運'));
});

test('the fold map is cut to the corpus and stays small', () => {
  assert.ok(Object.keys(normalize.fold).length < 400, `fold map has ${Object.keys(normalize.fold).length} entries`);
  assert.equal(normalize.fold['臺'], '台');
  assert.equal(normalize.fold['運'], '运');
});

test('tokens: CJK bigrams plus lowercase Latin words; a lone CJK character is a unigram', () => {
  assert.deepEqual(norm.tokenize('Taipei 捷運 OD'), ['taipei', '捷运', 'od']);
  assert.deepEqual(norm.tokenize('超圖'), ['超图']);
  assert.deepEqual(norm.tokenize('金'), ['金']);
});

test('query: Bopomofo and tone marks are stripped', () => {
  const q = prepareQuery('ㄐㄧㄣˊ金馬', 'datasets', normalize);
  assert.equal(q.cleaned, norm.normalize('金馬'));
});

test('query: filler words are not required to match', () => {
  const q = prepareQuery('有沒有立委連署的網絡資料', 'datasets', normalize);
  assert.equal(q.cleaned, norm.normalize('立委連署網絡'));
  assert.equal(ids(search.search('有沒有立委連署的網絡資料', 'datasets'))[0], 'ly');
});

test('query: longer than 100 characters is truncated and flagged', () => {
  const long = '捷運'.repeat(250);
  const q = prepareQuery(long, 'datasets', normalize);
  assert.equal(q.truncated, true);
  assert.equal(Array.from(q.text).length, 100);
  assert.equal(prepareQuery('捷運', 'datasets', normalize).truncated, false);
});

test('query: empty, or empty after fillers, gives no results and no error', () => {
  for (const raw of ['', '   ', '台灣 的 資料']) {
    const res = search.search(raw, 'datasets');
    assert.equal(res.query.empty, true, raw);
    assert.deepEqual(res.hits, []);
  }
});

test('query: generic words alone list everything in the mode', () => {
  const res = search.search('台灣 網絡 資料', 'datasets');
  assert.equal(res.browseAll, true);
  assert.deepEqual(ids(res).sort(), ['film', 'ly', 'metro', 'metro-mention', 'twnic']);
});

test('rule 1, coverage: a hit must match at least a third of the specific query terms', () => {
  const res = search.search('捷運高架橋墩工程', 'datasets');
  assert.ok(!ids(res).includes('metro-mention'), 'a single shared bigram in a long query is not enough');
});

test('Traditional, Simplified, 臺/台 and full-width queries find the same record', () => {
  for (const q of ['臺北捷運', '台北捷運', '台北捷运', '台北捷運'.replace('台', '臺'), 'ＭＲＴ']) {
    assert.equal(ids(search.search(q, 'datasets'))[0], 'metro', q);
  }
});

test('English and mainland-vocabulary queries reach Mandarin records through aliases', () => {
  assert.equal(ids(search.search('hypergraph', 'datasets'))[0], 'ly');
  assert.equal(ids(search.search('地铁客流网络', 'datasets'))[0], 'metro');
  assert.equal(ids(search.search('bipartite network', 'datasets'))[0], 'film');
});

test('a title match outranks a description-only match', () => {
  const res = ids(search.search('捷運', 'datasets'));
  assert.ok(res.indexOf('metro') < res.indexOf('metro-mention'), res.join());
});

test('rule 2, computer networking: non-internet datasets leave the results, and a hint shows', () => {
  for (const q of ['計算機網路', '電腦網路', 'computer network', 'TCP/IP']) {
    const res = search.search(q, 'datasets');
    assert.equal(res.hints.networking, true, q);
    for (const id of ['film', 'ly', 'metro', 'metro-mention']) assert.ok(!ids(res).includes(id), `${q}: ${id}`);
  }
});

test('rule 3, mode words: a course word in data mode shows a hint and does not switch', () => {
  const res = search.search('社會網絡分析 課程', 'datasets');
  assert.equal(res.hints.mode, 'courses');
  assert.equal(res.mode, 'datasets');
  assert.equal(search.search('捷運 dataset', 'courses').hints.mode, 'datasets');
});

test('rule 4, fuzzy matching only for Latin words of six or more letters', () => {
  assert.equal(ids(search.search('hypergrahp', 'datasets'))[0], 'ly');
  assert.deepEqual(ids(search.search('flim', 'datasets')), []);
});

test('only published records are results; withdrawn ones never appear', () => {
  assert.ok(!ids(search.search('已下架的捷運資料', 'datasets')).includes('gone'));
});

test('wanted entries come back in a separate group, not as results', () => {
  const res = search.search('人口遷徙', 'datasets');
  assert.deepEqual(res.hits, []);
  assert.deepEqual(res.wanted.map((w) => w.id), ['migration']);
});

test('course mode searches courses, and English reaches Mandarin course records', () => {
  assert.equal(ids(search.search('social network analysis', 'courses'))[0], 'sna-course');
  assert.equal(ids(search.search('graph theory', 'courses'))[0], 'gt-course');
});

test('the other mode is counted for the cross-type hint', () => {
  const res = search.search('社會網絡分析', 'datasets');
  assert.equal(res.otherCount, 1);
});

test('facet counts are computed over the hits', () => {
  const res = search.search('台灣 網絡', 'datasets');
  assert.equal(res.facets.domains.transport, 2);
  assert.equal(res.facets.kinds.hypergraph, 1);
});

test('a hostile query is treated as text and does not throw', () => {
  const res = search.search('<script>alert(1)</script>', 'datasets');
  assert.equal(res.query.raw, '<script>alert(1)</script>');
  assert.deepEqual(res.hits, []);
  assert.doesNotThrow(() => search.search('\u0000\uD800)(*&^%$#@!~`\\', 'datasets'));
});

test('rule 2 in course mode: the catalog has no computer-networking courses, so such a query returns none', () => {
  const extra = [...RECORDS, rec({ id: 'social-computing', type: 'course', url: '/courses/social-computing/', title: { zh: '網路科學與社會計算', en: 'Network Science and Social Computing' }, kinds: [] })];
  const s = createSearch({ schema: 1, normalize: makeNormalizeData(concepts, extra.flatMap((r) => [r.title.zh, r.title.en, ...r.aliases])), records: extra });
  const res = s.search('計算機網路', 'courses');
  assert.deepEqual(res.hits, []);
  assert.equal(res.hints.networking, true);
});

test('a record boost demotes historical courses below current ones with the same match', () => {
  const two = [
    rec({ id: 'a-old', type: 'course', url: '/courses/a-old/', title: { zh: '網絡科學導論', en: '' }, kinds: [], boost: 0.7 }),
    rec({ id: 'b-new', type: 'course', url: '/courses/b-new/', title: { zh: '網絡科學導論', en: '' }, kinds: [] }),
  ];
  const s = createSearch({ schema: 1, normalize: makeNormalizeData(concepts, two.map((r) => r.title.zh)), records: two });
  // Ids chosen so the alphabetical tie-break alone would put the historical one first.
  assert.deepEqual(s.search('網絡科學', 'courses').hits.map((h) => h.id), ['b-new', 'a-old']);
});
