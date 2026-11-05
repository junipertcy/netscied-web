// Site-wide constants: names, contact channels and external links. Edit here.
export const SITE = {
  name: '台灣網絡科學教育',
  nameEn: 'Network Science Education in Taiwan',
  origin: 'https://netscied.tw',
  contactEmail: 'hi@netscied.tw',
  github: 'https://github.com/junipertcy/netscied-web',
  maintainer: { name: '顏子祺', nameEn: 'Tzu-Chi Yen', url: 'https://junipertcy.info/about' },
  /**
   * The no-account request form (owner decision Q5/A5). Until the owner creates
   * the Google Form, url is null and pages offer email and GitHub instead.
   * prefillParam is the form's `entry.<id>` for the requested-data field.
   */
  requestForm: { url: null as string | null, prefillParam: null as string | null },
  courseDirectory: 'https://course-tvc.yuntech.edu.tw/WebU/index.aspx',
} as const;

const enc = encodeURIComponent;

/** Links that carry a visitor's query to a request channel (WCAG 3.3.7: no redundant entry). */
export function requestLinks(query: string) {
  const q = query ?? '';
  const issue = `${SITE.github}/issues/new?template=request-dataset.yml&title=${enc(`[徵求] ${q}`)}&need=${enc(q)}`;
  const mail = `mailto:${SITE.contactEmail}?subject=${enc(`資料需求：${q}`)}&body=${enc(`我需要的資料：${q}\n用途：\n可能的來源：\n`)}`;
  const form = SITE.requestForm.url && SITE.requestForm.prefillParam
    ? `${SITE.requestForm.url}?usp=pp_url&${SITE.requestForm.prefillParam}=${enc(q)}`
    : null;
  return { issue, mail, form };
}

/** External catalogs, with the query filled in where the catalog supports it (site-search spec). */
export function externalCatalogs(query: string) {
  const q = enc(query ?? '');
  const list = [
    { name: '政府資料開放平臺', url: `https://data.gov.tw/datasets/search?p=1&size=10&s=_score_desc&rft=${q}` },
    { name: 'depositar 研究資料寄存所', url: `https://data.depositar.io/dataset/?q=${q}` },
    { name: 'Google 資料集搜尋', url: `https://datasetsearch.research.google.com/search?query=${q}` },
    { name: 'Zenodo', url: `https://zenodo.org/search?q=${q}` },
  ];
  // Netzschleuder indexes English names only.
  if (/[A-Za-z]/.test(query ?? '')) list.push({ name: 'Netzschleuder', url: `https://networks.skewed.de/?search=${q}` });
  return list;
}
