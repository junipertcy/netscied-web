// schema.org JSON-LD (agent-access spec, "Structured data for search engines").
// Every fact here is also visible text on the page that embeds it.
import { ApiRecord } from './api';
import { SITE } from './site';

const CATALOG = { '@type': 'DataCatalog', name: SITE.name, url: `${SITE.origin}/datasets/` };

export function breadcrumbs(items: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [{ name: '首頁', path: '/' }, ...items].map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: SITE.origin + it.path,
    })),
  };
}

export function temporalCoverage(t: ApiRecord | null | undefined): string | undefined {
  if (!t?.start) return undefined;
  if (t.ongoing) return `${t.start}/..`;
  if (!t.end || t.end === t.start) return t.start;
  return `${t.start}/${t.end}`;
}

export function datasetCreators(d: ApiRecord) {
  const out: object[] = [];
  if (d.redistribution?.basis === 'own-work') out.push({ '@type': 'Organization', name: SITE.name, url: `${SITE.origin}/` });
  for (const c of d.creators ?? []) {
    if (d.redistribution?.basis === 'own-work' && /netscied/.test(c.url ?? '')) continue;
    out.push({ '@type': 'Organization', name: c.organization['zh-Hant'], ...(c.organization.en ? { alternateName: c.organization.en } : {}), ...(c.url ? { url: c.url } : {}) });
  }
  for (const p of d.credits ?? []) {
    if (!p.name) continue;
    out.push({ '@type': 'Person', name: p.name['zh-Hant'] ?? p.name.en, ...(p.orcid ? { identifier: p.orcid, sameAs: p.orcid } : {}) });
  }
  if (!out.length && d.provenance?.source?.publisher) out.push({ '@type': 'Organization', name: d.provenance.source.publisher['zh-Hant'] });
  return out;
}

export function datasetKeywords(d: ApiRecord): string[] {
  return [...new Set([...(d.keywords ?? []), ...(d.domains ?? []).map((x: ApiRecord) => x['zh-Hant']), ...(d.structure_badges ?? []).map((b: ApiRecord) => b['zh-Hant'])])];
}

export function datasetJsonLd(d: ApiRecord) {
  const v = d.latest_version;
  const license = d.license.url ? d.license.url : { '@type': 'CreativeWork', name: d.license.name['zh-Hant'] };
  return {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: d.title['zh-Hant'],
    ...(d.title.en ? { alternateName: d.title.en } : {}),
    description: d.description['zh-Hant'],
    url: d.url,
    identifier: v?.doi ? `https://doi.org/${v.doi}` : d.url,
    ...(v ? { version: v.version } : {}),
    license,
    creator: datasetCreators(d),
    isAccessibleForFree: true,
    spatialCoverage: { '@type': 'Place', name: d.coverage.spatial['zh-Hant'] },
    ...(temporalCoverage(d.coverage.temporal) ? { temporalCoverage: temporalCoverage(d.coverage.temporal) } : {}),
    keywords: datasetKeywords(d),
    inLanguage: 'zh-Hant-TW',
    isBasedOn: d.provenance.source.url,
    creditText: d.attribution,
    includedInDataCatalog: CATALOG,
    ...(v
      ? {
          distribution: v.files.map((f: ApiRecord) => ({
            '@type': 'DataDownload',
            name: f.path,
            contentUrl: f.url,
            encodingFormat: f.media_type,
            contentSize: `${f.bytes} B`,
            sha256: f.sha256,
          })),
        }
      : {}),
  };
}

export function dataCatalogJsonLd(datasets: ApiRecord[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'DataCatalog',
    name: SITE.name,
    alternateName: SITE.nameEn,
    url: `${SITE.origin}/datasets/`,
    description: '收錄和台灣有關的網絡資料集：圖、超圖、單純複形、排名與成對比較等關聯資料。',
    inLanguage: 'zh-Hant-TW',
    license: 'https://creativecommons.org/publicdomain/zero/1.0/',
    dataset: datasets.map((d) => ({ '@type': 'Dataset', name: d.title['zh-Hant'], url: d.url })),
  };
}

const LANG: Record<string, string> = { zh: 'zh', en: 'en', nan: 'nan', hak: 'hak' };

export function courseJsonLd(c: ApiRecord) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Course',
    name: c.title['zh-Hant'],
    ...(c.title.en ? { alternateName: c.title.en } : {}),
    description: c.summary?.['zh-Hant'] ?? c.inclusion_note['zh-Hant'],
    url: c.url,
    ...(c.course_code ? { courseCode: c.course_code } : {}),
    provider: { '@type': 'CollegeOrUniversity', name: c.university['zh-Hant'], ...(c.university.ror ? { sameAs: c.university.ror } : {}) },
    ...(c.languages.length ? { inLanguage: c.languages.map((l: ApiRecord) => LANG[l.id] ?? l.id) } : {}),
    educationalLevel: c.level['zh-Hant'],
    hasCourseInstance: c.offerings.map((o: ApiRecord) => ({
      '@type': 'CourseInstance',
      name: `${c.title['zh-Hant']} ${o.term_label ?? `${o.start}–${o.end}`}`,
      url: o.evidence_url,
      ...(o.start ? { startDate: o.start, endDate: o.end } : {}),
      ...(o.instructors.length ? { instructor: o.instructors.map((i: ApiRecord) => ({ '@type': 'Person', name: i.name })) } : {}),
    })),
  };
}
