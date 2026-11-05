// Records in /api/v1/catalog.json: the text the search core indexes, plus the
// few fields a result card shows. Each record gets the labels and aliases of
// every concept it carries (design D4: the concept/alias table).
const conceptKeys = (record) => {
  const s = record.structure ?? {};
  const keys = new Set();
  for (const k of s.kinds ?? []) keys.add(`kind:${k}`);
  if (s.partitions?.count === 2) keys.add('property:bipartite');
  if (s.partitions?.count > 2) keys.add('property:multipartite');
  if (s.directed) keys.add('property:directed');
  if (s.weighted) keys.add('property:weighted');
  if (s.signed) keys.add('property:signed');
  if (s.temporal && s.temporal.form !== 'none') keys.add('property:temporal');
  if (s.layers === 'multiplex' || s.layers === 'multilayer') keys.add('property:multilayer');
  if (s.spatial && s.spatial.form !== 'none') keys.add('property:spatial');
  for (const d of record.domains ?? []) keys.add(`domain:${d}`);
  for (const t of record.tags ?? []) keys.add(`tag:${t}`);
  if (record.category) keys.add(`category:${record.category}`);
  for (const c of record.concepts ?? []) keys.add(c);
  return keys;
};

export function conceptsFor(record, vocab) {
  const keys = conceptKeys(record);
  return vocab.concepts.concepts.filter((c) => {
    if (keys.has(c.id)) return true;
    const a = c.attach ?? {};
    return (
      (a.kind && keys.has(`kind:${a.kind}`)) ||
      (a.property && keys.has(`property:${a.property}`)) ||
      (a.domain && keys.has(`domain:${a.domain}`)) ||
      (a.tag && keys.has(`tag:${a.tag}`)) ||
      (a.category && keys.has(`category:${a.category}`))
    );
  });
}

const aliasesOf = (concepts) => [...new Set(concepts.flatMap((c) => [c['zh-Hant'], c.en, ...c.aliases]))];

export function datasetSearchRecord(source, full, vocab) {
  const concepts = conceptsFor(source, vocab);
  return {
    type: 'dataset',
    id: full.id,
    url: `/datasets/${full.id}/`,
    status: 'published',
    title: { zh: full.title['zh-Hant'], en: full.title.en ?? '' },
    keywords: [...full.keywords, ...full.tags.map((t) => t['zh-Hant']), ...full.tags.map((t) => t.en)],
    aliases: aliasesOf(concepts),
    description: [full.description['zh-Hant'], full.semantics.node?.['zh-Hant'], full.semantics.link?.['zh-Hant']].filter(Boolean).join(' '),
    en: [full.description.en, full.semantics.node?.en, full.semantics.link?.en].filter(Boolean).join(' '),
    internet: concepts.some((c) => c.id === 'topic:internet'),
    domains: source.domains ?? [],
    kinds: source.structure?.kinds ?? [],
    display: {
      summary: full.summary['zh-Hant'],
      badges: full.structure_badges.map((b) => b['zh-Hant']),
      domains: full.domains.map((d) => d['zh-Hant']),
      size: full.size?.text?.['zh-Hant'] ?? '',
      license: full.license.id === 'NOASSERTION' || full.license.id === 'NONE' ? full.license.name['zh-Hant'] : full.license.id,
      version: full.latest_version ? `${full.latest_version.version}（${full.latest_version.released}）` : '外部連結',
    },
  };
}

export function wantedSearchRecord(source, entry, vocab) {
  const concepts = conceptsFor(source, vocab);
  return {
    type: 'wanted',
    id: entry.id,
    url: `/wanted/#${entry.id}`,
    status: 'wanted',
    title: { zh: entry.title['zh-Hant'], en: entry.title.en ?? '' },
    keywords: source.keywords ?? [],
    aliases: aliasesOf(concepts),
    description: [entry.description?.['zh-Hant'], entry.reason?.['zh-Hant']].filter(Boolean).join(' '),
    en: entry.description?.en ?? '',
    internet: false,
    domains: source.domains ?? [],
    kinds: [],
    display: { status: entry.status_label['zh-Hant'], requests: entry.requests },
  };
}

export function courseSearchRecord(source, full, vocab) {
  const concepts = conceptsFor(source, vocab);
  const instructors = full.latest.instructors.map((i) => i.name).join('、') || '未列出';
  return {
    type: 'course',
    id: full.id,
    url: `/courses/${full.id}/`,
    status: 'published',
    title: { zh: full.title['zh-Hant'], en: full.title.en ?? '' },
    keywords: [...full.keywords, full.university['zh-Hant'], full.university.short, full.department['zh-Hant'], ...full.offerings.flatMap((o) => o.instructors.map((i) => i.name))].filter(Boolean),
    aliases: aliasesOf(concepts),
    description: [full.summary?.['zh-Hant'], full.inclusion_note['zh-Hant']].filter(Boolean).join(' '),
    en: [full.summary?.en, full.university.en, full.department.en].filter(Boolean).join(' '),
    internet: false,
    domains: [],
    kinds: [],
    category: source.category,
    university: source.university,
    // Current courses rank above dormant ones, and both above historical records.
    ...(full.freshness.id === 'historical' ? { boost: 0.7 } : full.freshness.id === 'dormant' ? { boost: 0.85 } : {}),
    display: {
      university: `${full.university.short ?? full.university['zh-Hant']} ${full.department['zh-Hant']}`,
      instructors,
      term: full.latest.term_label ?? `${full.latest.start}–${full.latest.end}`,
      term_en: full.latest.term_label_en ?? '',
      level: full.level['zh-Hant'],
      languages: full.languages.map((l) => l['zh-Hant']).join('、'),
      freshness: full.freshness['zh-Hant'],
    },
  };
}
