// Machine-readable siblings of the pages (task 7.1; agent-access and
// site-structure specs): an index.md beside every dataset and course page, the
// Atom feed at /news/feed.xml, and /llms.txt. All are written from the same API
// records the pages render, so they always agree.
import { ORIGIN, SITE } from './api.mjs';
import { escapeXml } from './text.mjs';

const nf = new Intl.NumberFormat('en-US');
const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const zh = (t) => t?.['zh-Hant'] ?? '';

function humanBytes(n) {
  if (n < 1024) return `${nf.format(n)} B`;
  const units = ['KB', 'MB', 'GB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

export function datasetMarkdown(d) {
  const L = [];
  const page = `${ORIGIN}/datasets/${d.id}/`;
  L.push(`# ${zh(d.title)}`, '');
  if (d.title.en) L.push(`*${d.title.en}*`, '');
  if (d.status === 'withdrawn') {
    L.push(`此資料集已於 ${d.withdrawn.date} 下架。原因：${zh(d.withdrawn.reason)}`, '', '本站不再提供這份資料的檔案。', '', `- 頁面：${page}`, `- JSON：${d.api_url}`, '');
    return L.join('\n');
  }
  L.push(zh(d.description), '');
  L.push('## 重點資訊', '');
  const facts = [
    ['結構', d.structure_text['zh-Hant']],
    ['節點代表', zh(d.semantics.node)],
    ['連結代表', zh(d.semantics.link)],
    ['規模', d.size ? `${zh(d.size.text)}${d.size.approximate ? '（約略值）' : ''}` : '尚未計算'],
    ['時間範圍', d.coverage.temporal ? zh(d.coverage.temporal) : '—'],
    ['空間範圍', zh(d.coverage.spatial)],
    ['領域', d.domains.map(zh).join('、')],
    ['與臺灣的關係', d.taiwan_relevance.justification],
    ['最新版本', d.latest_version ? `${d.latest_version.version}（${d.latest_version.released}）` : '外部連結（本站未轉載檔案）'],
    ['授權', `${zh(d.license.name)}（${d.license.id}）${d.license.url ? ` ${d.license.url}` : ''}`],
    ['本站可否轉載', `${d.redistribution.may_redistribute ? '可以' : '不可以'}：${zh(d.redistribution.label)}`],
    ['DOI', d.latest_version?.doi ?? '尚無'],
    ['個資等級', `${zh(d.personal_data.label)}（審查日期 ${d.personal_data.reviewed_on}）`],
  ];
  for (const [k, v] of facts) L.push(`- **${k}**：${v}`);
  L.push('');
  if (d.latest_version) {
    const v = d.latest_version;
    L.push(`## 下載（版本 ${v.version}）`, '', '| 格式 | 檔案 | 大小 | SHA-256 |', '|---|---|---|---|');
    for (const f of v.files) L.push(`| ${cell(zh(f.format_label))} | [${cell(f.path)}](${f.url}) | ${humanBytes(f.bytes)}（${nf.format(f.bytes)} bytes） | \`${f.sha256}\` |`);
    L.push('');
    if (v.checksums_url) L.push(`檢查碼清單：${v.checksums_url}`);
    if (v.zip_url) L.push(`全部檔案（ZIP）：${v.zip_url}`);
    L.push('');
  } else {
    L.push('## 取得資料', '', '本站不轉載這份資料，請到來源網站取得：', '');
    for (const a of d.access) L.push(`- [${zh(a.label)}](${a.url})`);
    if (d.license.statement) L.push('', `來源的授權說明：${zh(d.license.statement)}`);
    L.push('');
  }
  L.push('## 如何引用', '', d.citation.text, '', '```bibtex', d.citation.bibtex, '```', '');
  L.push('## 授權與姓名標示', '', '```', d.attribution, '```', '');
  L.push('## 資料來源', '', `[${zh(d.provenance.source.name)}](${d.provenance.source.url})${d.provenance.source.publisher ? `，${zh(d.provenance.source.publisher)}` : ''}`);
  if (d.provenance.retrieved_at) L.push(`來源快照擷取於 ${d.provenance.retrieved_at}。`);
  if (d.provenance.method) L.push(`蒐集方法：${zh(d.provenance.method)}`);
  L.push('');
  if (d.versions.length) {
    L.push('## 版本紀錄', '', '| 版本 | 發布日期 | 來源快照日期 | 變更說明 | 版本 DOI |', '|---|---|---|---|---|');
    for (const v of d.versions) L.push(`| ${v.version} | ${v.released} | ${v.snapshot_date ?? '—'} | ${cell(zh(v.changelog))}${v.suspended ? '（暫停下載）' : ''} | ${v.doi ?? '—'} |`);
    L.push('');
  }
  if (d.personal_data.level !== 'none') {
    L.push('## 個人資料與下架', '', `${zh(d.personal_data.label)}。${d.personal_data.notes ? zh(d.personal_data.notes) : ''}`, `當事人如對收錄有疑義，請依下架與更正程序提出：${ORIGIN}/about/#takedown`, '');
  }
  if (d.description.en || d.title.en) {
    L.push('## In English', '');
    if (d.title.en) L.push(`**${d.title.en}**`, '');
    if (d.description.en) L.push(d.description.en, '');
    L.push(`License: ${d.license.name.en ?? d.license.id}. ${d.redistribution.label.en}.`, '');
  }
  L.push('---', '', `頁面：${page}  `, `JSON：${d.api_url}  `, `記錄更新於 ${d.updated}`, '');
  return L.join('\n');
}

export function courseMarkdown(c) {
  const L = [`# ${zh(c.title)}`, ''];
  if (c.title.en) L.push(`*${c.title.en}*`, '');
  L.push(`${c.freshness['zh-Hant']}`, '');
  const langs = c.languages.map(zh).join('、') || '未確認';
  for (const [k, v] of [
    ['學校', `${c.university['zh-Hant']}（${c.university.en}）`],
    ['系所', zh(c.department)],
    ['課號', c.course_code ?? '—'],
    ['類別', `${zh(c.category)}（${zh(c.relevance)}）`],
    ['層級', zh(c.level)],
    ['授課語言', c.unverified?.fields.includes('languages') ? `${langs}（未確認，${c.unverified.checked_on} 查核）` : langs],
    ['收錄原因', zh(c.inclusion_note)],
  ]) L.push(`- **${k}**：${v}`);
  L.push('');
  if (c.summary) L.push(zh(c.summary), '');
  if (c.disclosure) L.push(zh(c.disclosure), '');
  L.push('## 開課紀錄', '', '| 學期 | 教師 | 出處 | 查核日期 |', '|---|---|---|---|');
  for (const o of c.offerings) {
    const who = o.instructors.map((i) => i.name).join('、') || (o.unverified?.fields.includes('instructors') ? '待確認' : '未列出');
    const checked = o.verified_on ?? `未確認（${o.unverified?.checked_on}）`;
    L.push(`| ${o.term_label ?? `${o.start}–${o.end}`} | ${cell(who)} | ${o.evidence_url} | ${checked} |`);
  }
  L.push('');
  if (c.title.en || c.summary?.en) {
    L.push('## In English', '');
    if (c.title.en) L.push(`**${c.title.en}**, ${c.university.en}${c.department.en ? `, ${c.department.en}` : ''}.`, '');
    if (c.summary?.en) L.push(c.summary.en, '');
  }
  L.push('---', '', `頁面：${c.url}  `, `JSON：${c.api_url}  `, `記錄更新於 ${c.updated}`, '');
  return L.join('\n');
}

// Atom 1.0 (RFC 4287): the 20 newest items, or all of them if fewer. Entry ids
// are the items' permanent anchors on /news/, so they never change.
// Feed readers resolve links against the feed, not the page, so every
// root-relative href or src in an entry becomes an absolute https://netscied.tw URL.
export function absolutizeHtml(html) {
  return String(html ?? '').replace(/\b(href|src)=(["'])\/(?!\/)/g, (_, attr, q) => `${attr}=${q}${ORIGIN}/`);
}

export function atomFeed(news) {
  const items = news.slice(0, 20);
  const stamp = (date) => `${date}T00:00:00+08:00`;
  const updated = items[0] ? stamp(items[0].date) : '1970-01-01T00:00:00+08:00';
  const entries = items.map((n) =>
    [
      '  <entry>',
      `    <id>${escapeXml(n.url)}</id>`,
      `    <title>${escapeXml(zh(n.title))}</title>`,
      `    <link rel="alternate" type="text/html" href="${escapeXml(n.url)}"/>`,
      `    <updated>${stamp(n.date)}</updated>`,
      `    <published>${stamp(n.date)}</published>`,
      `    <content type="html">${escapeXml(absolutizeHtml(n.body_html))}</content>`,
      '  </entry>',
    ].join('\n'),
  );
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="zh-Hant-TW">',
    `  <id>${ORIGIN}/news/</id>`,
    `  <title>${escapeXml(SITE['zh-Hant'])} 消息</title>`,
    `  <subtitle>台灣網絡資料與網絡課程的新消息</subtitle>`,
    `  <link rel="self" type="application/atom+xml" href="${ORIGIN}/news/feed.xml"/>`,
    `  <link rel="alternate" type="text/html" href="${ORIGIN}/news/"/>`,
    `  <updated>${updated}</updated>`,
    `  <author><name>${escapeXml(SITE['zh-Hant'])}</name><uri>${ORIGIN}/</uri></author>`,
    `  <rights>CC0 1.0（本站撰寫的內容）</rights>`,
    ...entries,
    '</feed>',
    '',
  ].join('\n');
}

export function llmsTxt({ index, published }) {
  const examples = published.slice(0, 3).map((f) => `- [${zh(f.full.title)}](${f.full.url}) — ${f.full.structure_text.en}; ${f.full.license.id}`);
  return `# 台灣網絡科學教育（netscied.tw）

> 和台灣有關的網絡資料集（圖、超圖、單純複形、排名與成對比較等關聯資料），以及台灣各大學開設的網絡科學課程。
> Network datasets about Taiwan (graphs, hypergraphs, simplicial complexes, rankings and pairwise comparisons) and network-science courses taught at universities in Taiwan.

目前收錄 ${index.counts.datasets} 筆資料集（其中 ${index.counts.hosted} 筆由本站託管檔案）、${index.counts.courses} 門課程、${index.counts.wanted} 項徵求中的資料。
Currently ${index.counts.datasets} datasets (${index.counts.hosted} with files hosted here), ${index.counts.courses} courses and ${index.counts.wanted} wanted entries. Pages are in Traditional Mandarin with an English section; every record also has English titles.

## 網址 / URL patterns

- 資料集列表 Dataset table: ${ORIGIN}/datasets/
- 單一資料集 One dataset: ${ORIGIN}/datasets/<id>/ (Markdown: ${ORIGIN}/datasets/<id>/index.md)
- 課程 Courses: ${ORIGIN}/courses/ and ${ORIGIN}/courses/<id>/ (Markdown: …/index.md)
- 資料許願池 Wanted data: ${ORIGIN}/wanted/
- 搜尋 Search (needs JavaScript; use the API instead): ${ORIGIN}/search/?q=<query>&type=datasets|courses
- 託管檔案 Hosted files: ${ORIGIN}/data/<id>/<version>/ (immutable; each folder has SHA256SUMS)

## API（不需金鑰、靜態 JSON） / API (static JSON, no key)

- [API index](${ORIGIN}/api/v1/index.json): every file, record counts, API version, metadata license.
- [datasets.json](${ORIGIN}/api/v1/datasets.json) / datasets.csv: all published datasets in summary form; full records at /api/v1/datasets/<id>.json.
- [courses.json](${ORIGIN}/api/v1/courses.json) / courses.csv; full records at /api/v1/courses/<id>.json.
- [wanted.json](${ORIGIN}/api/v1/wanted.json), [news.json](${ORIGIN}/api/v1/news.json), [taxonomy.json](${ORIGIN}/api/v1/taxonomy.json) (every controlled vocabulary with Mandarin and English labels).
- JSON Schemas of these responses: ${ORIGIN}/api/v1/schema/ (for example dataset-record.schema.json).
- catalog.json is internal (the browser's search payload); do not depend on its shape.

## 欄位 / Field meanings (dataset records)

- \`id\`: permanent ASCII slug; never reused. \`status\`: published, withdrawn (a tombstone with \`withdrawn.date\` and \`withdrawn.reason\`, no files) or renamed (\`current_id\`).
- \`structure.kinds\`: graph, hypergraph, simplicial-complex, cell-complex, ranking, pairwise-comparison, other-relational (the first is native). Properties are fields: \`structure.directed\`, \`weighted\` (+ \`weight.meaning\`), \`partitions\`, \`layers\`, \`temporal.form\`, \`spatial.form\`. \`structure_text\` says it in words.
- \`semantics.node\` and \`semantics.link\`: what a node and a link represent.
- \`domains\`: one to three of society, politics, culture, economy, transport, technology, information, life, health.
- \`license.id\`: SPDX id (for example OGDL-Taiwan-1.0, CC-BY-4.0), LicenseRef-*, NOASSERTION or NONE; \`license.class\`; \`redistribution.may_redistribute\` tells whether this site may host the files.
- \`latest_version.files[]\`: \`url\`, \`format\`, \`bytes\`, \`sha256\` for every hosted file; link-only records have \`access[]\` links to the upstream source instead.
- \`personal_data.level\`: none, public-role, private-individuals, sensitive.
- \`citation.text\` and \`citation.bibtex\`: ready to use; they cite the version URL until a version DOI exists. \`attribution\`: the text the license requires.

## 篩選 / How to filter

- By structure: datasets.json entries whose \`kinds\` includes "hypergraph".
- By domain: entries whose \`domains[].id\` is "transport".
- Hosted files only: \`hosted\` is true; may redistribute: \`redistribution.may_redistribute\` is true.
- Courses by category: courses.json \`category.id\` in network-science, social-network-analysis, graph-theory, graph-ml.

## 授權與引用 / License and citation

- Catalog metadata written by this site is CC0 1.0 (quoted license text and metadata copied from upstream sources keep their own terms). Each dataset keeps its own license; read \`license\` and \`attribution\` before reuse.
- Cite a dataset with its record's \`citation\` field; cite the site as 台灣網絡科學教育（netscied.tw）, ${ORIGIN}/.

## 範例 / Examples

${examples.join('\n')}

## 其他 / Other

- [關於本站 About](${ORIGIN}/about/): contribution channels, takedown procedure, privacy notice.
- [Atom feed](${ORIGIN}/news/feed.xml), [sitemap](${ORIGIN}/sitemap.xml).
- Contact: ${'hi'}@netscied.tw
`;
}

export function renderOutputs({ write, published, withdrawn, courses, news, index }) {
  for (const { full } of [...published, ...withdrawn]) write(`datasets/${full.id}/index.md`, datasetMarkdown(full));
  for (const { full } of courses) write(`courses/${full.id}/index.md`, courseMarkdown(full));
  write('news/feed.xml', atomFeed(news));
  write('llms.txt', llmsTxt({ index, published }));
}
