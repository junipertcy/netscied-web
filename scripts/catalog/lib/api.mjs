// Turns catalog records into the public JSON API records (agent-access spec,
// "Every record is directly usable by an agent"). The detail pages render these
// same objects, so a page and its JSON always agree.
import { effectiveClass, licenseClass, mayHost } from './licenses.mjs';
import { firstSentence, joinLines, joinText } from './text.mjs';
import { freshness, termIndex, termLabel, termLabelEn, termOfDate } from './terms.mjs';

export const ORIGIN = 'https://netscied.tw';
export const SITE = { 'zh-Hant': '台灣網絡科學教育', en: 'Network Science Education in Taiwan', url: `${ORIGIN}/` };

const label = (vocab, group, id) => {
  const l = vocab.labels[group]?.[id];
  return l ? { id, 'zh-Hant': l['zh-Hant'], en: l.en } : { id, 'zh-Hant': id, en: id };
};
const entryLabel = (map, id) => {
  const e = map.get(id);
  return e ? { id, 'zh-Hant': e['zh-Hant'], en: e.en } : { id, 'zh-Hant': id, en: id };
};
const yearOf = (date) => (date ? String(date).slice(0, 4) : '');
const nf = new Intl.NumberFormat('en-US');

// Badges: kinds, then the properties that apply.
export function structureBadges(structure, vocab) {
  const s = structure ?? {};
  const badges = (s.kinds ?? []).map((k) => ({ ...label(vocab, 'kinds', k), group: 'kind' }));
  const prop = (id) => badges.push({ ...label(vocab, 'properties', id), group: 'property' });
  if ((s.kinds ?? []).includes('graph')) prop(s.directed ? 'directed' : 'undirected');
  if (s.weighted) prop('weighted');
  if (s.signed) prop('signed');
  if (s.partitions?.count === 2) prop('bipartite');
  else if (s.partitions?.count > 2) prop('multipartite');
  if (s.multi_edges) prop('multi_edges');
  if (s.layers && s.layers !== 'single') badges.push({ ...label(vocab, 'layers', s.layers), group: 'property' });
  if (s.temporal && s.temporal.form !== 'none') prop('temporal');
  if (s.spatial && s.spatial.form !== 'none') prop('spatial');
  return badges;
}

// "Structure in words" for the key-facts list.
export function structureInWords(structure, vocab) {
  const s = structure ?? {};
  const zh = [];
  const en = [];
  const kinds = (s.kinds ?? []).map((k) => label(vocab, 'kinds', k));
  if (s.partitions?.count >= 2) {
    const names = s.partitions.names;
    zh.push(`${s.partitions.count === 2 ? '二分' : `${s.partitions.count} 分`}${kinds[0]?.['zh-Hant'] ?? ''}（${names.map((n) => n['zh-Hant']).join('–')}）`);
    en.push(`${s.partitions.count === 2 ? 'bipartite' : `${s.partitions.count}-partite`} ${kinds[0]?.en ?? ''} (${names.map((n) => n.en ?? n.id).join('–')})`);
  } else if (kinds.length) {
    zh.push(kinds.map((k) => k['zh-Hant']).join('、'));
    en.push(kinds.map((k) => k.en).join(', '));
  }
  if ((s.kinds ?? []).includes('graph')) {
    zh.push(s.directed ? '有向' : '無向');
    en.push(s.directed ? 'directed' : 'undirected');
  }
  if (s.weighted) {
    zh.push(`加權（${s.weight?.meaning?.['zh-Hant'] ?? '權重'}${s.weight?.unit ? `，單位 ${s.weight.unit}` : ''}）`);
    en.push(`weighted (${s.weight?.meaning?.en ?? 'weights'}${s.weight?.unit ? `, unit ${s.weight.unit}` : ''})`);
  }
  if (s.signed) {
    zh.push('帶正負號');
    en.push('signed');
  }
  if (s.multi_edges) {
    zh.push('允許多重邊');
    en.push('multi-edges');
  }
  if (s.self_loops) {
    zh.push('含自環');
    en.push('self-loops');
  }
  if (s.layers && s.layers !== 'single') {
    const l = label(vocab, 'layers', s.layers);
    zh.push(l['zh-Hant']);
    en.push(l.en);
  }
  if (s.temporal && s.temporal.form !== 'none') {
    const t = label(vocab, 'temporal', s.temporal.form);
    zh.push(`時序：${t['zh-Hant']}${s.temporal.resolution ? `（${s.temporal.resolution}）` : ''}`);
    en.push(`temporal: ${t.en}${s.temporal.resolution ? ` (${s.temporal.resolution})` : ''}`);
  }
  if (s.spatial && s.spatial.form !== 'none') {
    const sp = label(vocab, 'spatial', s.spatial.form);
    zh.push(`空間：${sp['zh-Hant']}`);
    en.push(`spatial: ${sp.en}`);
  }
  if (s.ranking) {
    const r = label(vocab, 'ranking_data_type', s.ranking.data_type);
    zh.push(r['zh-Hant']);
    en.push(r.en);
  }
  return { 'zh-Hant': zh.join('，'), en: en.join(', ') };
}

// Size: from the latest manifest for hosted data, from the record for link-only data.
export function sizeOf(record, latestManifest, vocab) {
  const parts = record.structure?.partitions?.names ?? [];
  const stats = latestManifest?.statistics;
  let s;
  let approximate = false;
  if (stats?.graph) s = { nodes: stats.graph.nodes, edges: stats.graph.edges, partitions: stats.graph.partitions };
  else if (stats?.hypergraph) s = { nodes: stats.hypergraph.nodes, hyperedges: stats.hypergraph.hyperedges, incidences: stats.hypergraph.incidences };
  else if (stats?.ranking) s = { alternatives: stats.ranking.alternatives, rankings: stats.ranking.voters };
  else if (stats?.comparison) s = { nodes: stats.comparison.items, comparisons: stats.comparison.comparisons };
  else if (record.counts) {
    const { approximate: a, as_of, note, ...rest } = record.counts;
    s = rest;
    approximate = !!a;
  }
  if (!s) return null;
  const zh = [];
  const en = [];
  const approx = approximate ? '約 ' : '';
  const approxEn = approximate ? 'about ' : '';
  if (s.partitions && parts.length) {
    zh.push(parts.map((p) => `${p['zh-Hant']} ${nf.format(s.partitions[p.id] ?? 0)}`).join('、'));
    en.push(parts.map((p) => `${nf.format(s.partitions[p.id] ?? 0)} ${p.en ?? p.id}`).join(', '));
  } else if (s.nodes !== undefined) {
    zh.push(`${approx}${nf.format(s.nodes)} 個節點`);
    en.push(`${approxEn}${nf.format(s.nodes)} nodes`);
  }
  if (s.edges !== undefined) {
    zh.push(`${approx}${nf.format(s.edges)} 條連結`);
    en.push(`${approxEn}${nf.format(s.edges)} edges`);
  }
  if (s.hyperedges !== undefined) {
    zh.push(`${approx}${nf.format(s.hyperedges)} 條超邊`);
    en.push(`${approxEn}${nf.format(s.hyperedges)} hyperedges`);
  }
  if (s.alternatives !== undefined) {
    zh.push(`${nf.format(s.alternatives)} 個選項`);
    en.push(`${nf.format(s.alternatives)} alternatives`);
  }
  if (s.rankings !== undefined) {
    zh.push(`${nf.format(s.rankings)} 份排名`);
    en.push(`${nf.format(s.rankings)} rankings`);
  }
  if (s.comparisons !== undefined) {
    zh.push(`${nf.format(s.comparisons)} 次比較`);
    en.push(`${nf.format(s.comparisons)} comparisons`);
  }
  return { ...s, approximate, ...(record.counts?.as_of && !stats ? { as_of: record.counts.as_of } : {}), text: { 'zh-Hant': zh.join('、'), en: en.join(', ') } };
}

function temporalText(coverage) {
  const t = coverage?.temporal;
  if (!t || (!t.start && !t.end)) return null;
  const end = t.ongoing ? '至今' : t.end ?? '';
  const endEn = t.ongoing ? 'present' : t.end ?? '';
  const same = t.start && t.end && t.start === t.end;
  return {
    start: t.start ?? null,
    end: t.end ?? null,
    ongoing: !!t.ongoing,
    'zh-Hant': same ? t.start : `${t.start ?? ''}–${end}`,
    en: same ? t.start : `${t.start ?? ''}–${endEn}`,
  };
}

const ownWork = (r) => r.redistribution?.basis === 'own-work';

// Organisations and consented people, for the citation's author list.
function citationAuthors(record, people) {
  // The site's own compilations are credited to the site.
  if (ownWork(record)) return [`${SITE['zh-Hant']}（netscied.tw）`];
  const names = [];
  for (const c of record.creators ?? []) {
    if (c.organization) names.push(c.organization['zh-Hant'] ?? c.organization.en);
    else if (c.person && people.get(c.person)) {
      const p = people.get(c.person);
      names.push(p.name['zh-Hant'] ?? p.name.en);
    }
  }
  if (!names.length) names.push(`${SITE['zh-Hant']}（netscied.tw）`);
  return [...new Set(names)];
}

function bibKey(id, version) {
  return `netscied_${id.replace(/-/g, '_')}${version ? `_${version.replace(/\./g, '_')}` : ''}`;
}

function bibEscape(s) {
  return String(s).replace(/[{}\\]/g, '');
}

export function citationFor(record, latest, people, pageUrl) {
  const authors = citationAuthors(record, people);
  const title = record.title?.['zh-Hant'];
  if (latest) {
    const target = latest.doi ? `https://doi.org/${latest.doi}` : `${pageUrl}#v${latest.version}`;
    const text = `${authors.join('、')}（${yearOf(latest.released)}）。${title}（版本 ${latest.version}）［資料集］。${SITE['zh-Hant']}。${target}`;
    const bib = [
      `@misc{${bibKey(record.id, latest.version)},`,
      `  author = {${authors.map(bibEscape).join(' and ')}},`,
      `  title = {${bibEscape(title)}${record.title?.en ? ` / ${bibEscape(record.title.en)}` : ''}},`,
      `  year = {${yearOf(latest.released)}},`,
      `  version = {${latest.version}},`,
      `  publisher = {netscied.tw},`,
      latest.doi ? `  doi = {${latest.doi}},` : null,
      `  url = {${target}},`,
      `  note = {Dataset}`,
      `}`,
    ].filter(Boolean);
    return { text, bibtex: bib.join('\n'), url: target };
  }
  const src = record.provenance?.source;
  const checked = record.provenance?.checked_on ?? record.license?.evidence?.checked_on;
  const text = `${authors.join('、')}。${title}［資料集］。取自 ${src?.url}${checked ? `（${checked} 擷取）` : ''}。收錄於 ${SITE['zh-Hant']}：${pageUrl}`;
  const bib = [
    `@misc{${bibKey(record.id)},`,
    `  author = {${authors.map(bibEscape).join(' and ')}},`,
    `  title = {${bibEscape(title)}${record.title?.en ? ` / ${bibEscape(record.title.en)}` : ''}},`,
    `  howpublished = {${src?.url}},`,
    checked ? `  urldate = {${checked}},` : null,
    `  note = {Dataset; catalogued at ${pageUrl}}`,
    `}`,
  ].filter(Boolean);
  return { text, bibtex: bib.join('\n'), url: src?.url };
}

export function attributionFor(record, vocab, latest) {
  const title = record.title?.['zh-Hant'];
  const lic = vocab.byId.licenses.get(record.license?.id);
  if (ownWork(record)) {
    return `${title}，${SITE['zh-Hant']}（netscied.tw）整理，依${lic?.name?.['zh-Hant'] ?? record.license?.id}授權：${lic?.url ?? ''}`.trim();
  }
  const parts = [];
  const who = (record.creators ?? []).map((c) => c.organization?.['zh-Hant']).filter(Boolean).join('、') || record.provenance?.source?.name?.['zh-Hant'];
  if (record.license?.attribution) parts.push(joinLines(record.license.attribution));
  else if (licenseClass(record.license?.id, vocab) === 'link-only') {
    parts.push(`${title}，${who}。來源未載明開放授權，請依來源網站的規定使用：${record.provenance?.source?.url ?? ''}`);
  } else {
    parts.push(`${title}，${who}，依${lic?.name?.['zh-Hant'] ?? record.license?.id}授權${lic?.url ? `：${lic.url}` : ''}`);
  }
  if (latest) parts.push(`本站轉換版本（${latest.version}）：${ORIGIN}/datasets/${record.id}/`);
  return parts.join('\n');
}

// The consented people credited on a dataset page, with only the fields they agreed to.
export function creditsFor(record, people) {
  const out = [];
  for (const c of record.creators ?? []) {
    if (!c.person) continue;
    const p = people.get(c.person);
    if (!p) continue;
    const credit = { role: c.role ?? 'contributor' };
    for (const field of p.display) {
      if (field === 'name') credit.name = p.name;
      if (field === 'affiliation' && p.affiliation) credit.affiliation = p.affiliation;
      if (field === 'orcid' && p.orcid) credit.orcid = p.orcid;
      if (field === 'homepage' && p.homepage) credit.homepage = p.homepage;
    }
    out.push(credit);
  }
  return out;
}

export function versionRecord(m, vocab) {
  const files = m.suspended || m.withdrawn
    ? []
    : m.files.map((f) => ({
        path: f.path,
        url: f.url,
        format: f.format,
        format_label: entryLabel(vocab.byId.formats, f.format),
        media_type: f.media_type,
        role: f.role,
        bytes: f.bytes,
        sha256: f.sha256,
        ...(f.conforms_to ? { conforms_to: f.conforms_to } : {}),
      }));
  const find = (role) => files.find((f) => f.role === role)?.url ?? null;
  return {
    version: m.version,
    released: m.released,
    snapshot_date: m.snapshot_date ?? null,
    changelog: joinText(m.changelog),
    doi: m.doi ?? null,
    license: m.license ?? null,
    files,
    checksums_url: find('checksums'),
    zip_url: find('bundle'),
    statistics: m.suspended || m.withdrawn ? undefined : m.statistics,
    computed_by: m.computed_by ? { tool: m.computed_by.tool, version: m.computed_by.version } : undefined,
    ...(m.suspended ? { suspended: true } : {}),
    ...(m.withdrawn ? { withdrawn: { date: m.withdrawn.date, reason: joinText(m.withdrawn.reason) } } : {}),
  };
}

const semverKey = (v) => v.split('.').map((n) => n.padStart(6, '0')).join('.');

export function buildDatasetRecord(record, ctx) {
  const { vocab, people, manifests = [], updated } = ctx;
  const id = record.id;
  const url = `${ORIGIN}/datasets/${id}/`;
  const api_url = `${ORIGIN}/api/v1/datasets/${id}.json`;
  const title = record.title;
  if (record.status === 'withdrawn') {
    return {
      id,
      status: 'withdrawn',
      url,
      api_url,
      title,
      withdrawn: { date: record.withdrawn.date, reason: joinText(record.withdrawn.reason) },
      aliases: record.aliases ?? [],
      updated,
    };
  }
  const sorted = [...manifests].sort((a, b) => (semverKey(b.version) > semverKey(a.version) ? 1 : -1));
  const versions = sorted.map((m) => versionRecord(m, vocab));
  const latestManifest = sorted.find((m) => !m.withdrawn) ?? null;
  const latest = versions.find((v) => !v.withdrawn) ?? null;
  const lic = vocab.byId.licenses.get(record.license?.id);
  const cls = licenseClass(record.license?.id, vocab);
  const basis = record.redistribution?.basis;
  const description = joinText(record.description);
  return {
    id,
    status: record.status,
    url,
    api_url,
    markdown_url: `${url}index.md`,
    title,
    description,
    summary: { 'zh-Hant': firstSentence(description?.['zh-Hant']), ...(description?.en ? { en: firstSentence(description.en, 160) } : {}) },
    keywords: record.keywords ?? [],
    semantics: { node: joinText(record.semantics?.node), link: joinText(record.semantics?.link) },
    structure: { ...record.structure, notes: joinText(record.structure?.notes) },
    structure_badges: structureBadges(record.structure, vocab),
    structure_text: structureInWords(record.structure, vocab),
    size: sizeOf(record, latestManifest, vocab),
    coverage: {
      temporal: temporalText(record.coverage),
      spatial: record.coverage?.spatial ?? { 'zh-Hant': '臺灣', en: 'Taiwan' },
    },
    domains: (record.domains ?? []).map((d) => entryLabel(vocab.byId.domains, d)),
    tags: (record.tags ?? []).map((t) => entryLabel(vocab.byId.tags, t)),
    taiwan_relevance: {
      basis: record.taiwan_relevance.basis.map((b) => label(vocab, 'taiwan_relevance', b)),
      justification: record.taiwan_relevance.justification,
      ...(record.taiwan_relevance.subset_note ? { subset_note: joinText(record.taiwan_relevance.subset_note) } : {}),
    },
    license: {
      id: record.license.id,
      name: record.license.name ?? lic?.name ?? { 'zh-Hant': record.license.id, en: record.license.id },
      url: record.license.url ?? lic?.url ?? null,
      class: cls,
      class_label: label(vocab, 'license_class', cls),
      ...(record.license.statement ? { statement: joinText(record.license.statement) } : {}),
      ...(record.license.evidence ? { evidence: { url: record.license.evidence.url, checked_on: record.license.evidence.checked_on } } : {}),
    },
    redistribution: {
      basis,
      label: label(vocab, 'redistribution', basis),
      may_redistribute: mayHost(record, vocab) && basis !== 'link-only',
      effective_class: effectiveClass(record, vocab),
      ...(record.redistribution.permission_ref ? { permission_ref: record.redistribution.permission_ref } : {}),
      ...(record.redistribution.note ? { note: joinText(record.redistribution.note) } : {}),
    },
    personal_data: {
      level: record.personal_data.level,
      label: label(vocab, 'personal_data', record.personal_data.level),
      reviewed_on: record.personal_data.reviewed_on,
      ...(record.personal_data.notes ? { notes: joinText(record.personal_data.notes) } : {}),
      ...(record.personal_data.small_cell_threshold ? { small_cell_threshold: record.personal_data.small_cell_threshold } : {}),
    },
    hosted: versions.length > 0,
    latest_version: latest,
    versions,
    access: (record.provenance?.access ?? []).map((a) => ({ ...a, label: joinText(a.label), format_label: a.format ? entryLabel(vocab.byId.formats, a.format) : null })),
    provenance: {
      source: record.provenance.source,
      method: joinText(record.provenance.method),
      checked_on: record.provenance.checked_on ?? null,
      retrieved_at: latestManifest?.snapshot_date ?? null,
    },
    creators: (record.creators ?? []).filter((c) => c.organization).map((c) => ({ organization: c.organization, ...(c.url ? { url: c.url } : {}), ...(c.ror ? { ror: c.ror } : {}), role: c.role ?? 'publisher' })),
    credits: creditsFor(record, people),
    references: record.references ?? [],
    citation: citationFor(record, latest, people, url),
    attribution: attributionFor(record, vocab, latest),
    related: record.related ?? {},
    aliases: record.aliases ?? [],
    added: record.added,
    published: record.published ?? record.added,
    updated,
    ...(record.wanted ? { wanted: wantedBlock(record, vocab) } : {}),
  };
}

function wantedBlock(record, vocab) {
  const status = record.status === 'published' ? 'published' : record.wanted.status ?? 'seeking';
  return {
    reason: joinText(record.wanted.reason),
    status,
    status_label: label(vocab, 'wanted_status', status),
    requests: record.wanted.requests ?? 0,
    ...(record.wanted.unavailable_reason ? { unavailable_reason: joinText(record.wanted.unavailable_reason) } : {}),
  };
}

export function buildWantedEntry(record, vocab) {
  const w = wantedBlock(record, vocab);
  return {
    id: record.id,
    url: `${ORIGIN}/wanted/#${record.id}`,
    title: record.title,
    description: joinText(record.description),
    domains: (record.domains ?? []).map((d) => entryLabel(vocab.byId.domains, d)),
    reason: w.reason,
    status: w.status,
    status_label: w.status_label,
    requests: w.requests,
    ...(w.unavailable_reason ? { unavailable_reason: w.unavailable_reason } : {}),
    ...(record.status === 'published' ? { dataset_url: `${ORIGIN}/datasets/${record.id}/` } : {}),
  };
}

export function datasetSummary(full) {
  return {
    id: full.id,
    url: full.url,
    api_url: full.api_url,
    title: full.title,
    summary: full.summary,
    kinds: full.structure.kinds,
    structure_badges: full.structure_badges,
    domains: full.domains,
    size: full.size,
    temporal: full.coverage.temporal,
    // Shared fields keep the full record's shape (review of Milestone A, finding 5).
    license: { id: full.license.id, name: full.license.name, url: full.license.url, class: full.license.class },
    redistribution: { basis: full.redistribution.basis, label: full.redistribution.label, may_redistribute: full.redistribution.may_redistribute },
    hosted: full.hosted,
    latest_version: full.latest_version ? { version: full.latest_version.version, released: full.latest_version.released, doi: full.latest_version.doi } : null,
    personal_data: { level: full.personal_data.level, label: full.personal_data.label, reviewed_on: full.personal_data.reviewed_on },
    added: full.added,
    updated: full.updated,
  };
}

export function buildCourseRecord(record, ctx) {
  const { vocab, today, updated } = ctx;
  const uni = vocab.byId.universities.get(record.university);
  const offerings = [...record.offerings]
    .sort((a, b) => termIndex(b.term ?? '') - termIndex(a.term ?? '') || String(b.start ?? '').localeCompare(String(a.start ?? '')))
    .map((o) => ({
      ...(o.term ? { term: o.term, term_label: termLabel(o.term), term_label_en: termLabelEn(o.term) } : {}),
      ...(o.start ? { start: o.start, end: o.end } : {}),
      ...(o.code ? { code: o.code } : {}),
      instructors: o.instructors,
      evidence_url: o.evidence_url,
      verified_on: o.verified_on,
      ...(o.syllabus_url ? { syllabus_url: o.syllabus_url } : {}),
      ...(o.archive_url ? { archive_url: o.archive_url } : {}),
      ...(o.note ? { note: joinText(o.note) } : {}),
      ...(o.unverified ? { unverified: { ...o.unverified, note: joinText(o.unverified.note) } } : {}),
    }));
  const current = termOfDate(today);
  const upcoming = offerings.filter((o) => o.term && termIndex(o.term) <= termIndex(current));
  const latest = upcoming[0] ?? offerings[0];
  const fresh = latest.term ? freshness(latest.term, current, { historical: record.historical }) : record.historical ? 'historical' : 'recent';
  const fl = label(vocab, 'freshness', fresh);
  const freshLabel = {
    id: fresh,
    'zh-Hant': fresh === 'recent' && latest.term ? `${fl['zh-Hant']}：${latest.term}` : fl['zh-Hant'],
    en: fresh === 'recent' && latest.term ? `${fl.en}: ${latest.term}` : fl.en,
  };
  return {
    id: record.id,
    url: `${ORIGIN}/courses/${record.id}/`,
    api_url: `${ORIGIN}/api/v1/courses/${record.id}.json`,
    markdown_url: `${ORIGIN}/courses/${record.id}/index.md`,
    title: record.title,
    university: { id: record.university, 'zh-Hant': uni?.['zh-Hant'], short: uni?.short, en: uni?.en, ...(uni?.ror ? { ror: uni.ror } : {}) },
    department: record.department,
    ...(record.course_code ? { course_code: record.course_code } : {}),
    category: label(vocab, 'course_category', record.category),
    relevance: label(vocab, 'relevance', record.relevance),
    offering_type: label(vocab, 'offering_type', record.offering_type),
    level: label(vocab, 'level', record.level),
    languages: record.languages.map((l) => label(vocab, 'language', l)),
    ...(record.unverified ? { unverified: { ...record.unverified, note: joinText(record.unverified.note) } } : {}),
    inclusion_note: joinText(record.inclusion_note),
    ...(record.summary ? { summary: joinText(record.summary) } : {}),
    keywords: record.keywords ?? [],
    historical: !!record.historical,
    ...(record.related_page ? { related_page: `${ORIGIN}${record.related_page}` } : {}),
    ...(record.disclosure ? { disclosure: joinText(record.disclosure) } : {}),
    latest: {
      ...(latest.term ? { term: latest.term, term_label: latest.term_label, term_label_en: latest.term_label_en } : { start: latest.start, end: latest.end }),
      instructors: latest.instructors,
      ...(latest.unverified?.fields.includes('instructors') ? { instructors_unverified: true } : {}),
    },
    freshness: freshLabel,
    offerings,
    provenance: { found_via: record.provenance.found_via, added: record.provenance.added, reviewed: record.provenance.reviewed, ...(record.provenance.source_attribution ? { source_attribution: record.provenance.source_attribution } : {}) },
    updated,
  };
}

export function courseSummary(full) {
  return {
    id: full.id,
    url: full.url,
    api_url: full.api_url,
    title: full.title,
    university: full.university,
    department: full.department,
    category: full.category,
    relevance: full.relevance,
    level: full.level,
    languages: full.languages,
    languages_unverified: !!full.unverified?.fields.includes('languages'),
    latest: full.latest,
    freshness: full.freshness,
    historical: full.historical,
    updated: full.updated,
  };
}
