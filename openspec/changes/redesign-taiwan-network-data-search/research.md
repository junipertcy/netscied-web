# Research appendix: netscied.tw as a search engine for Taiwan network data and courses

Change: `redesign-taiwan-network-data-search`. This appendix brings together eight research reports written for the change. They cover the Taiwan data landscape and law, the metadata schema, the curation pipeline and researcher log, storage and cost, search, agent discoverability and MCP, courses, and UX and information architecture. It also draws on the reports' supporting notes. It is the evidence base for `proposal.md` and `design.md`. §14 records where the researchers disagreed and how the architect resolved it.

- **Research date: 2026-11-04.** Some API calls ran on 2026-11-05 (UTC or UTC+8).
- **Volatile facts carry a date.** Prices, quotas, software versions, counts, law status and service status are marked "as of 2026-11" or with the exact date they were checked. Re-check them before acting.
- **Legal points are design assumptions, not legal advice.** This covers 個人資料保護法, 著作權法, licences and terms of use. None of the researchers is a lawyer. Before hosting data about identifiable people, a short review by a Taiwanese IP and privacy lawyer is cheap insurance.
- **Labels.** A statement is a verified fact unless it is marked otherwise. Verified facts carry a primary-source URL inline, or name the method used (curl, dig, an API call, a local measurement). The other labels are:
  - **[Rep]**: reported by a secondary source or third-party code, and not re-verified.
  - **[Est]**: a derived estimate.
  - **[Rec]**: a researcher's recommendation or opinion.
- **Where the tests ran.** The researchers' egress IP geolocated to the US. `tisvcloud.freeway.gov.tw`, `opendata.judicial.gov.tw`, `konect.cc`, `coursemap.aca.ntu.edu.tw` and (intermittently) `timetable.nycu.edu.tw` timed out or misbehaved from there. Re-test from a Taiwan IP. This also affects any harvester that runs on AWS or GitHub Actions outside Taiwan.

---

## 1. Current state of netscied.tw

### 1.1 Domain and DNS (checked 2026-11-04 with whois, dig and curl)

- **Registrar.** The registrar is **Gandi SAS**. The domain was created 2017-04-11 and expires 2027-04-11.
- **DNS.** The name servers are Route 53 (`ns-*.awsdns-*`). **There is no DNSSEC** (no DS record). Checked with `whois -h whois.twnic.net.tw netscied.tw` and `dig DS netscied.tw`.
- **Apex TXT records.** There are two values in one record set: `v=spf1 include:_spf.protonmail.ch ~all` and `protonmail-verification=...`. Any new TXT value, such as an MCP-registry proof or a Search Console token, must be **added to that same record set**. Route 53 rejects a second record set with the same name and type.
- HTTP→HTTPS redirection is done by CloudFront.

### 1.2 Origin bucket

- **Origin.** The CloudFront origin is the S3 bucket **`netscied.tw` in `ap-northeast-2` (Seoul)**. The `x-amz-bucket-region` header gives the region. The ETag and `x-amz-version-id` served by CloudFront match the bucket's, which confirms the origin.
- **The bucket is publicly readable, so CloudFront can be bypassed.**
  - `http://netscied.tw.s3-website.ap-northeast-2.amazonaws.com/` returns 200.
  - `https://s3.ap-northeast-2.amazonaws.com/netscied.tw/index.html` returns 200.
  - Listing returns 403.
  - Consequence: dataset files placed in this bucket could be downloaded directly at **$0.126/GB** (Seoul data transfer out). That bypasses CloudFront's free tier, any WAF rule and any flat-rate plan.
- **Versioning.** S3 versioning appears to be enabled, because a non-null `x-amz-version-id` is returned. Without a lifecycle rule, every overwrite keeps the old copy.
- **Origin type.** From outside it is not possible to tell whether CloudFront uses the bucket's website endpoint or its REST endpoint. The custom error mapping hides the origin's 403/404. §13.5 gives the commands to check.
- **AWS account [Rep, assumption].** The account is presumed to predate 2025-07-15. If so, it is on the legacy Free Tier, long expired, and only "Always Free" allowances apply. This matters because accounts "using AWS Free Tier" cannot subscribe to CloudFront flat-rate plans (§8.1). Confirm it in the Billing console.

### 1.3 HTTP behaviour of the live site

- **The live site is still the 2020 Angular 9 SPA**, served with `<html lang="en">`.
- **Soft 404s everywhere.**
  - `https://netscied.tw/does-not-exist-xyz` returns `HTTP/2 200` with `x-cache: Error from cloudfront`. A CloudFront custom error response maps errors to `/index.html` with status 200.
  - `/robots.txt`, `/sitemap.xml` and every `/.well-known/*` path return `200 text/html` (`server: AmazonS3`). That includes `/.well-known/mcp-registry-auth`.
- **Why the soft 404s matter beyond cosmetics:**
  - An agent that gets 200 at a well-known path assumes the file exists, then fails to parse it. API Evangelist found 68 of 74 providers making this mistake (https://apievangelist.com/blog/2026/05/22/four-providers-publishing-well-known-api-catalog/).
  - MCP Registry HTTP verification fails explicitly on "`/.well-known/mcp-registry-auth` answering `200 OK` with an HTML error page" (https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/authentication.mdx).
  - Google classifies 200-for-missing as a soft 404 (https://developers.google.com/search/docs/crawling-indexing/http-network-errors#soft-404-errors).
- **`www` duplicate.** `https://www.netscied.tw/` returns 200 with the same content. `dig` shows the same CloudFront IPs, so a duplicate host exists.

### 1.4 Repository build state (not yet deployed)

- **Routes and navigation.** The routes are `''`, `networks`, `tools`, `refs`, `booklet`, `stat1021` and `**`. The navigation reads 簡介, 生活中的網絡, 電腦工具, 參考資料, 網絡素養小冊.
- **Build output.** The build writes one `index.html` per route, but **no 404 file**, because `**` is not prerendered. Internal links are slashless, and the root element is `<html lang="zh-Hant-TW">`.
- **Angular 22.2.4.**
  - It ships `TrailingSlashPathLocationStrategy` (`node_modules/@angular/common/fesm2022/_location-chunk.mjs`, l.191).
  - Its SSG writes a meta-refresh page for every `redirectTo` route (`@angular/build/src/utils/server-rendering/prerender.js` l.139–141).

### 1.5 Existing content and link health (2026-11-04)

**金馬獎 2018 (`dataset/relations.json`).**
- The file has sha256 `f2626f0f155fe67744a317e204ba41248f98a7af222acf792c861db60c700094` and is 27,375 bytes. It was added on 2019-12-17 in commit 98f36ff.
- **Size.** It has 174 nodes (42 films, 132 people) and 146 edges, but only **133 distinct pairs**. **13 pairs repeat**: apparently a person nominated in two categories for the same film, e.g. 張藝謀/影 and 劉若英/後來的我們. The award category is not stored.
- **Labelling errors on the old page.**
  - The data is a bipartite **multigraph**, so the old "simple" label is wrong.
  - "演員–電影" is also inaccurate. The person nodes include directors, editors, composers and action choreographers, so they are *nominees*.
- **Structure.** There are 41 components; the largest has 14 nodes (8.05%). Only 谷垣健治 links two films. One film title has a trailing space ("吉祥 ").
- **Provenance.** The visualisation is at https://jinma.today/relations, whose page reads "JINMA 來跨" and "Copyright © 2016 Jinma" and now shows 金馬62. Who compiled the JSON is undocumented.

**TWNIC 網路節點與頻寬.**
- **Address.** `map.twnic.net.tw/*` now 301-redirects to `map.twnic.tw/*`.
- **Download mechanics.** The GML is downloaded through a form POST that carries a hidden CSRF `token`, choosing a year and quarter for 2001–2026. Quarters are published in January, April, July and October. There is no stable file URL.
- **The 2026-07 file.**
  - It declares `directed 1` and has 115 nodes and 1,023 edges.
  - 509 node pairs are reciprocal, and 501 of those have equal bandwidth in both directions; 5 edges are unreciprocated.
  - Bandwidth exists **only as label text** ("179 mbps"), ranging from 2 to 2,520,000 Mbps.
  - Node colours fall into 3 undocumented classes.
- **Terms.** No terms of use appear on `map.twnic.tw` (checked 2026-11-04).

**`/refs` links** (curl, 2026-11-04):

| Entry | Status |
|---|---|
| NCKU 資料科學導論 syllabus `http://class-qry.acad.ncku.edu.tw/syllabus/online_display.php?syear=0106&sem=2&co_no=H212200&class_code=` | **200**, eight years on. The instructor homepage `http://myweb.ncku.edu.tw/~chengte/index.html` timed out |
| UCLA Math 168 (Porter), zip `https://www.math.ucla.edu/~mason/course-materials/networks-math168-ucla-spring2018.zip` | 200 |
| UMich CSCS 535 (Newman) `http://www-personal.umich.edu/~mejn/courses/2017/cscs535/index.html` | Redirects to `public.websites.umich.edu/...` and returns **403** |
| Stanford CS224W `http://web.stanford.edu/class/cs224w/index.html` | 200, but now shows the current offering |
| 給國中生的網絡科學 `https://www.math.ucla.edu/~mason/papers/teach-final.pdf` | 200 |
| 科學人 2019-02 `http://sa.ylib.com/MagArticle.aspx?Unit=featurearticles&id=4287` | Timed out; re-check |

**Other pages.**
- **`/tools`.** Its list lives on at https://github.com/junipertcy/Network-Code-Repository ("A centralized repository for network analysis tools.", last push 2019-12-16; checked with `gh` on 2026-11-04).
- **`/stat1021`.** Its 4 PDFs are on the dead `wiki.junipertcy.info`.
- **`/booklet`.** Its PDF links are partly dead.

---

## 2. Taiwan network-data landscape and seed datasets

### 2.1 Where the supply is (as of 2026-11-04)

- **Government portals.** data.gov.tw lists **52,581 datasets**, and **52,539** of them are under 政府資料開放授權條款－第1版. Source: the whole-catalog CSV `https://data.gov.tw/datasets/export/csv`, 68.8 MB with 22 columns.
- **International network catalogs are nearly empty for Taiwan:**

| Catalog (checked 2026-11-04) | Taiwan-specific entries |
|---|---|
| Netzschleuder (`/api/nets?full=True`, 794 entries) | 1: `cptond_china_transit/taiwan_metro`, added 2026-10-27. Others such as `product_space` only include Taiwan as a node |
| ICON (`/api/network/metadata`, 699 entries) | 0 |
| SNAP (`snap.stanford.edu/data/` index) | 0 |
| XGI-data (`xgi-org/xgi-data/index.json`) | 0 |
| Web of Life (324 networks, via its API) | 0 |
| KONECT (`konect.cc`) | Unreachable (connection timeout) |

The researcher's conclusion is that the site's value is **aggregating Taiwanese portals and Taiwanese researchers**.

### 2.2 Seed list (33 candidates)

The **Re-host?** column uses the source's values:
- **yes**: the licence permits redistribution.
- **link-only**: metadata and a link only.
- **needs-permission**: ask the rights holder first.

The **Privacy** column uses the personal-data level names adopted in §14: none / public-role / private-individuals / sensitive. These map from the Taiwan-data researcher's tiers A/B/C/D. Two rows marked † were not assigned a tier in the source, so the mapping there is the editor's. 🧑‍🔬 marks an upstream that is a Taiwanese researcher's own page, supplement, lab or community group; these drive outreach.

| ID | zh / en title | Structure | Publisher | Licence | Re-host? | Privacy | URL |
|---|---|---|---|---|---|---|---|
| TW-01 | 臺北捷運各站分時進出量統計 / Taipei MRT hourly station OD | directed, weighted, temporal (hourly), spatial | 臺北大眾捷運股份有限公司 via data.taipei | OGDL-Taiwan-1.0 | yes (OGDL §2); re-host aggregated OD matrices | none | https://data.gov.tw/dataset/128506 |
| TW-02 | 臺北市YouBike起訖站點統計 (+電輔車) / YouBike station OD | directed, weighted, spatial, multilayer (weekday/weekend; classic/e-bike) | 臺北市政府 (資訊局) | OGDL-Taiwan-1.0 | yes | none | https://data.gov.tw/dataset/166492 |
| TW-03 | 國道 ETC 旅次 M08A / M06A / Freeway gantry OD and trip paths | directed, weighted, temporal (5-min), spatial; M06A = paths | 交通部高速公路局 | OGDL-Taiwan-1.0 | yes (aggregates only) | none (trip-level microdata; aggregate) | https://data.gov.tw/dataset/37763 ; https://data.gov.tw/dataset/37760 |
| TW-04 | 臺北捷運相鄰兩站間行駛時間 / MRT adjacency and travel times | simple, weighted, spatial | via data.taipei | OGDL-Taiwan-1.0 | yes | none | https://data.gov.tw/dataset/128420 |
| TW-05 | Netzschleuder `cptond_china_transit/taiwan_metro` | directed, weighted, spatial (225 nodes, 465 edges) | Netzschleuder; upstream CPTOND-2025 (Wang et al., *Sci. Data* 13:188) | CC BY 4.0 | yes, but prefer a link with a quality note | none | https://networks.skewed.de/net/cptond_china_transit |
| TW-06 | TDX 公共運輸 GTFS / 公車路線站序 / public transport, all modes | multilayer, directed, spatial, temporal | 交通部 (TDX) | OGDL-Taiwan-1.0 (basic services) | yes (basic static data) | none | https://tdx.transportdata.tw/ |
| TW-07 | 國際及兩岸定期班機航線－客運 / international and cross-strait routes | bipartite (TW × foreign airports), weighted, annual | 交通部民用航空局 | OGDL-Taiwan-1.0 | yes | none | https://data.gov.tw/dataset/41618 |
| TW-08 | 國內航線各航空公司及航線班機載客資料 / domestic routes by airline | multilayer (airlines), weighted, temporal | via data.gov.tw | OGDL-Taiwan-1.0 | yes | none | https://data.gov.tw/dataset/33725 |
| TW-09 | 各直轄市、縣（市）間遷徙人口數按性別分 / inter-county migration | directed, weighted, monthly | 內政部戶政司 | OGDL-Taiwan-1.0 | yes, county-level aggregates only | none (raw cells contain 1s) | https://data.gov.tw/dataset/168209 |
| TW-10 | 台灣電力公司各區域間過去電力潮流量 / inter-regional power flows | directed, weighted, 10-min; 4 nodes | 台灣電力公司 | OGDL-Taiwan-1.0 | yes | none | https://data.gov.tw/dataset/37326 |
| TW-11 | TWNIC 連線頻寬 GML / inter-network bandwidth | weighted, temporal (2001–2026) | 財團法人台灣網路資訊中心 | **none stated** | needs-permission (TWNIC) | none | https://map.twnic.tw/main_gml.html |
| TW-12 | OpenStreetMap Taiwan extract / road network | spatial, (multi)directed | OpenStreetMap contributors (Geofabrik extract, 1.09 GB) | ODbL 1.0 | yes (share-alike) | none | https://download.geofabrik.de/asia/taiwan-latest.osm.pbf |
| TW-13 | 村里界圖 → village adjacency | spatial, planar, simple | 內政部國土測繪中心 | OGDL-Taiwan-1.0 | yes | none | https://data.gov.tw/dataset/7438 |
| TW-14 | 產業關聯統計 110年 163部門交易表 / input–output table | directed, weighted (dense) | 行政院主計總處 | OGDL-Taiwan-1.0 | yes | none | https://data.gov.tw/dataset/173546 |
| TW-15 | 進出口貿易值 按HS及主要國別分 / trade by HS × partner | ego/bipartite, weighted, multilayer (HS), temporal | 財政部統計處 | OGDL-Taiwan-1.0 | yes | none | https://data.gov.tw/dataset/28573 |
| TW-16 | 董監事資料集 / company–director registry (~1.48M rows) | bipartite, weighted (shares), temporal | 經濟部商業發展署 | OGDL-Taiwan-1.0 | **link-only** at person level; a company–company projection may be re-hosted | private-individuals | https://data.gov.tw/dataset/96731 |
| TW-17 | 上市公司獨立董監事兼任情形彙總表 / independent-director interlocks | bipartite | via data.gov.tw (CSV on mopsfin.twse.com.tw) | OGDL-Taiwan-1.0 | link-only at person level, or the company projection | private-individuals | https://data.gov.tw/dataset/24270 |
| TW-18 | 政府研究資訊系統 GRB 資料目錄集 / government research projects (FY1993–) | hypergraph (project = PI + researchers), bipartite with institutions, temporal | 國家科學及技術委員會 | OGDL-Taiwan-1.0 | yes at institution level; link-only at person level | none (institutions) / private-individuals (persons) | https://data.gov.tw/dataset/18707 |
| TW-19 | OpenAlex Taiwan-affiliated works / co-authorship | hypergraph/simplicial, citation, temporal | OpenAlex | CC0 1.0 | yes | public-role | https://docs.openalex.org/ |
| TW-20 | 立法院議案提案及連署 / bill co-sponsorship | **hypergraph**, directed, temporal | LYAPI by 歐噴有限公司 (upstream 立法院) | CC BY 4.0 (LYAPI) | yes | public-role | https://ly.govapi.tw/v2/bills |
| TW-21 | 院會表決資料 / plenary roll-call votes | **signed** bipartite (+1/−1/0), temporal | 立法院 | 立法院網站資料開放宣告 (LicenseRef) | yes (宣告 §1) | public-role | https://data.ly.gov.tw/getds.action?id=370 |
| TW-22 | 立法院各委員會委員名單 / committee membership | bipartite, temporal | 立法院 | 立法院網站資料開放宣告 | yes | public-role | https://data.ly.gov.tw/getds.action?id=14 |
| TW-23 | Cross-strait co-sponsorship network 2008–2025 (Zenodo 15864841) | co-sponsorship (likely a weighted projection) | "RKk" (no affiliation) | CC BY 4.0 | yes; verify contents first | public-role | https://doi.org/10.5281/zenodo.15864841 |
| TW-24 | 中選會 選舉資料庫 / election results | bipartite (candidate × area), weighted, **rankings**, spatial, temporal | 中央選舉委員會 | OGDL-Taiwan-1.0 | yes (results fields only) | public-role | https://data.gov.tw/dataset/13119 |
| TW-25 | 政治獻金會計報告書 / political donations | bipartite (donor → candidate/party), weighted | 監察院 | OGDL-Taiwan-1.0 | **link-only**; at most a corporate-donor subgraph | private-individuals | https://ardata.cy.gov.tw/ |
| TW-26 | 全國法規資料庫 → legal reference network | directed (citation, delegation), temporal | 法務部 | OGDL-Taiwan-1.0; statutes not copyrightable | yes | none | https://law.moj.gov.tw/api/swagger/docs/v1 |
| TW-27 | 司法院裁判書 → judgment citation network | directed citation, temporal | 司法院 | 司法院開放資料使用規範 (custom) | **link-only** (texts); derived edges need permission | private-individuals | https://opendata.judicial.gov.tw/ |
| TW-28 | 野球革命 rebas.tw CPBL open data 2023–2025 🧑‍🔬 | **pairwise comparisons/rankings**, batter–pitcher bipartite, temporal | rebas.tw community group | ODC-By 1.0 | yes | public-role | https://github.com/rebas-tw/rebas.tw-open-data |
| TW-29 | 專利一案兩請關聯案件 / patent twin filings | simple pairs | 經濟部智慧財產局 | OGDL-Taiwan-1.0 | yes | none | https://data.gov.tw/dataset/30121 |
| TW-30 | EcoBase Ecopath models (Kuosheng Bay, Chiku Lagoon, Tapong Bay, Nanwan Bay) 🧑‍🔬 | weighted directed food webs | model authors (林幸助, 邵廣昭 et al.) | EcoBase data-access agreement (not open) | needs-permission | none | https://ecobase.ecopath.org/ |
| TW-31 | 合歡山高山植物–訪花昆蟲網絡 (Kudo et al. 2023) 🧑‍🔬 | bipartite, weighted, seasonal | 王俊能 (NTU) / G. Kudo | unknown (no deposit found) | needs-permission | none † | doi:10.1111/1440-1703.12426 (paper only) |
| TW-32 | Wikidata Taiwan subgraph | multirelational directed knowledge graph | Wikidata | CC0 1.0 | yes | public-role † (filter living persons) | https://www.wikidata.org/wiki/Wikidata:Licensing |
| TW-33 | 金馬獎 2018 入圍關係網 (existing) | bipartite multigraph | jinma.today (provenance unclear); facts from 台北金馬影展執行委員會 | none recorded | needs-permission, or rebuild from the official list | public-role | https://jinma.today/relations |

A derivable extra is the **zh.wikipedia link graph** (`dumps.wikimedia.org/zhwiki/latest/zhwiki-latest-pagelinks.sql.gz`, HTTP 200, Last-Modified 2026-11-01, CC BY-SA 4.0). It becomes useful only once "Taiwan-related" is defined, for example by category.

### 2.3 Facts about individual candidates that affect design

- **Volume.** The TW-01 monthly OD files (`tcgmetro.blob.core.windows.net/stationod/…_YYYYMM.csv`) are **302 MB** for 2026-09, with ~117 months since 2017-01. TW-03 M06A is trip-level microdata. [Rec] Re-host aggregates and link the raw files.
- **Small cells.** TW-09 holds 38 monthly CSVs of ~**340,913 rows** each, at village × sex level, with cells of 1. Re-host county-level aggregates.
- **Geo-blocking.** TW-03's history host (https://tisvcloud.freeway.gov.tw/history/TDCS/M08A/) and TW-27's host timed out from the US.
- **TW-05 quality.** Its largest-component fraction is **0.52**. Names are machine-translated (upstream figshare doi:10.6084/m9.figshare.29377427, built from 8684.cn and Amap). It is filed under "Bus and metro networks of Chinese cities". EcoBase likewise files TW-30 sites under "China". Our metadata should state the location neutrally and note the discrepancy.
- **TW-06 TDX.** It is OGDL for 「免審核提供資料」 (https://motc-ptx.gitbook.io/tdx-xin-shou-zhi-yin/api-shi-yong-shuo-ming/zi-liao-shi-yong-chang-jian-wen-ti). Attribution 「資料介接「交通部TDX平臺」」 plus the logo is required. The limit is 50 calls/day without a key.
- **No power-grid network.** The TW-10 transmission topology is not public; only plan lists exist (data.gov.tw 166619).
- **Fetch failure.** The TW-16 file `https://data.gcis.nat.gov.tw/od/file?oid=7E5201D9-CAD2-494E-8920-5319D66F66A1` returned HTTP 500.
- **Publication duties.** Publication is legally required for TW-16 by 公司法 §393 II(5) (https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=J0080001&flno=393) and for TW-25 by 政治獻金法 §21(4) (https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=D0020049&flno=21).
- **LY data.**
  - LYAPI held **148,971 bills** (2026-11-04), with a bulk copy on Hugging Face as `openfun/tw-ly-bill`. The footer says data CC-BY-4.0, code BSD-3.
  - TW-21 has 1,513 records, updated daily. Its licence page is https://data.ly.gov.tw/copyprotection.action.
- **TW-24.** A CEC leak of 1,573 candidates' personal data was reported on 2026-10-28 (https://today.line.me/tw/v3/article/zNMo1P6). Ingest only results fields.
- **TW-27 deletion duty.** Judgments later withdrawn must be deleted (https://opendata.judicial.gov.tw/api/Newses/42/file).
- **Outreach contacts.** TW-28 (`CPBL-2025-OpenData.zip`, 90 MB): rebastaiwan@gmail.com. TW-30: 林幸助 (中興大學) and 邵廣昭 (中研院). TW-31 (130 plant species, 15,127 visits): no deposit found.

**Excluded or refused as seeds:**
- private-user PTT, Dcard, FB and LINE interaction networks (PTT data include IPs; Chang et al. 2024, doi:10.37016/mr-2020-144);
- CDC contact chains (Art. 6);
- NHIRD patient-level networks (at most link aggregate products such as https://pmc.ncbi.nlm.nih.gov/articles/PMC5852024/);
- TCI-HSS (subscription);
- 臺鐵 42699, which holds per-station counts, not OD.

### 2.4 data.gov.tw: metadata standard and machine access (tested 2026-11-04)

- **Metadata standard.** 「資料集詮釋資料標準指引」 (數位發展部, 2024-05; https://file.data.gov.tw/content/附件1_資料集詮釋資料標準指引.pdf, linked from https://data.gov.tw/m2m) follows DCAT Catalog/Dataset/Distribution.
  - It defines 37 fields per the M2M page (38 definitions in the PDF).
  - `license` enum: **1** OGDL v1, **11** CC BY 4.0, **12** CC BY-SA 4.0, **13** OFL-1.1, **14** CC0.
  - An `en` block carries English text.
  - [Rec] Reuse its field names where they map.
- **Access.**
  - REST v2 `https://data.gov.tw/api/v2/rest/dataset/{id}` works without a key, but gives 403 to Python's default UA. The list endpoint `POST /api/v2/rest/dataset` needs a key (`ER0001: API Key錯誤`).
  - The OpenAPI spec is at https://file.data.gov.tw/政府資料開放跨平臺介接規範.yaml.
  - The **daily export** `https://data.gov.tw/datasets/export/csv` is the cheapest harvest path. **It contains civil-servant names and phone numbers (`提供機關聯絡人姓名/電話`); drop them at ingest.**
  - Pages embed schema.org `Dataset`.
  - The DCAT Turtle (`https://data.gov.tw/api/front/dataset/dcat.detail?nid={id}`) is served as `text/csv`, hard-codes its baseURI, misspells `accrualPeriodity` and contradicts the JSON. **Treat the JSON API as the source of truth.**
  - There is no CKAN API; data.taipei has a CKAN-like frontstage API.
- **Withdrawals.** Agencies may withdraw datasets (OGDL §5), and data.gov.tw keeps a 「預計下架資料集」 list.
- **Fallback catalogs** to link: data.gov.tw, TDX, data.ly.gov.tw/LYAPI, Netzschleuder, ICON, XGI-data, KONECT (with a status note), TBN/TaiBIF plus EcoBase, and optionally SNAP.

---

## 3. Licensing

### 3.1 政府資料開放授權條款－第1版 (OGDL v1)

- **SPDX id `OGDL-Taiwan-1.0`.**
  - Its name is "Taiwan Open Government Data License, version 1.0", and it is `isOsiApproved: false` (https://spdx.org/licenses/OGDL-Taiwan-1.0.html). It is in SPDX License List 3.29.0, released 2026-09-16, and is not deprecated (https://spdx.org/licenses/licenses.json).
  - It was added in the commit "Add OGDL-Taiwan-1.0" on 2021-02-14 (spdx/license-list-XML). The owner's belief that it has an SPDX id is correct.
  - The same list also has `OGL-UK-3.0`, `OGL-Canada-2.0`, `NLOD-2.0`, `CC-BY-4.0`, `CC0-1.0`, `ODbL-1.0`, `ODC-By-1.0` and `PDDL-1.0`.
- **Text** (中華民國104年7月27日訂定, https://data.gov.tw/license):
  - **§1(5).** Non-copyrightable 資訊 are treated alike.
  - **§2.** The grant is unrestricted in purpose, time and territory; non-exclusive, irrevocable and royalty-free. It covers reproduce, distribute, publicly transmit, edit, adapt and derive, and **§2(2) allows sublicensing**. Patents and trademarks are excluded.
  - **§3(2).** Attribution must follow the 附件「顯名聲明」. 「未盡顯名標示義務者，視為自始未取得開放資料之授權」.
  - **§4(2).** 「本條款與『創用CC授權 姓名標示 4.0 國際版本』相容，使用者依本條款利用開放資料，如後續以『創用CC授權 姓名標示 4.0 國際版本』規定之方式利用，視為符合本條款之規定。」 This is **one-way compatibility with CC BY 4.0**: networks derived from OGDL data may be published under CC BY 4.0.
  - **§5.** Agencies may stop providing data, including for privacy reasons. That is a reason to keep our own snapshot.
- **The 附件 顯名聲明.** It has three items, which users and **all derivatives** must reproduce:
  > 提供機關／單位 [年份] [開放資料釋出名稱與版本號]
  > 此開放資料依政府資料開放授權條款 (Open Government Data License) 進行公眾釋出，使用者於遵守本條款各項規定之前提下，得利用之。
  > 政府資料開放授權條款：https://data.gov.tw/license
- **data.taipei** uses the same licence (`license_name: "依政府資料開放授權條款-第1版"`). **TDX** uses OGDL v1 for its basic services, with its own attribution text and logo (§2.3).
- [Rec] Store a per-dataset attribution statement and render it on the dataset page, in the download README and in `ATTRIBUTION.txt`.

### 3.2 Other Taiwanese grants and terms (none has an SPDX id; model as `LicenseRef-…`)

| Grant | Terms |
|---|---|
| 立法院網站資料開放宣告 (https://data.ly.gov.tw/copyprotection.action) | Free, non-exclusive, sublicensable, irrevocable; attribution; PDPA reminder. Record it as `LicenseRef-TW-LY-Open-Data-Declaration` |
| 林業署 生態調查資料庫系統 declaration (https://ecollect.forest.gov.tw/Ecological/SystemManager/opendata.aspx) | Same template as the LY declaration |
| 司法院開放資料使用規範 | Custom. Requires marking modifications and attributing the source, plus a **deletion-sync duty** for withdrawn judgments |
| EcoBase data-access agreement | Cite every model and contact the authors. Not an open licence |
| TWNIC | No terms stated |

### 3.3 Copyright facts behind the licence rules

- **著作權法** (https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=J0070017):
  - Art. 7 protects compilations only for original selection and arrangement.
  - Art. 9 excludes laws, official documents, 數表 and 表格.
  - Art. 10-1 protects expression only.
  - [Rec] Bare results and nomination lists are facts, so our own compilation can carry our licence. But do not *rely* on that: terms of service and the PDPA still apply.
- **CC BY 4.0 §2(a)(4).** "technical modifications necessary … in all media and formats" "never produce Adapted Material" (https://creativecommons.org/licenses/by/4.0/legalcode.en ; ND: https://creativecommons.org/licenses/by-nd/4.0/legalcode.en). Lossless format conversion is allowed even under ND; cleaning is adaptation.
- **ODbL 1.0** (https://opendatacommons.org/licenses/odbl/1-0/):
  - 4.4: derivative databases stay ODbL.
  - 4.3: Produced Works need only "Contains information from DATABASE NAME, which is made available here under the Open Database License (ODbL)."
  - 4.6: offer the derivative, or "the method of making the alterations".
- **How licences are recorded** [Rec, schema researcher]:
  - `license.id` is an SPDX id checked against pinned SPDX 3.29.0. `LicenseRef-<slug>` (needs a name and URL) covers custom terms; `NOASSERTION` means unknown (SPDX 2.3 §7.7, https://spdx.github.io/spdx-spec/v2.3.1/package-information/); `NONE` means all rights reserved.
  - A separate `redistribution.basis` takes license-permits / written-permission / own-work / link-only. The schema blocks `license-permits` with NOASSERTION or NONE.
  - `license.attribution` holds the 顯名聲明.
  - Show two badges: 授權 and 本站可否轉載.
  - Lesson from the catalogs: Netzschleuder has no licence field in its API (450 of 833 modules say `None`), and ICON and SNAP have none at all.
- The re-host classes are in §6.4.

---

## 4. PDPA (個人資料保護法) and ethics

Primary text: https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=I0050021 (database cut-off 115-10-30). Enforcement rules (施行細則): pcode I0050022, https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=I0050022.

### 4.1 Status of the law as of 2026-11-04

- **The 2023-05-31 amendment** (華總一經字第11200045441號) added **Art. 1-1** (主管機關為個人資料保護委員會) and amended Art. 48.
  - Art. 48 took effect on promulgation.
  - **Art. 1-1's effective date is set by the Executive Yuan, and it has not been set.**
  - A joint notice of 2023-12-28 moved NDC's Art. 53/55 powers to the **個人資料保護委員會籌備處** from 2024-01-01 (https://law.moj.gov.tw/LawClass/LawHistory.aspx?pcode=I0050021).
- **The 2025 amendment** passed third reading on **2025-10-17** and was promulgated on **2025-11-11** (華總一經字第11400114521號). Sources: https://www.pdpc.gov.tw/News_Content/20/1001/ ; https://www.cna.com.tw/news/aipl/202510170211.aspx ; https://www.president.gov.tw/Page/294/50044.
  - **Amended:** 1-1, 12, 18, 21, 22–26, 41, 47–49, 52, 53, 55. **Added:** 1-2, 20-1, 21-1–21-5, 51-1, 53-1. **Deleted:** 27.
  - **Content:** breach reporting to the PDPC, a common security rule (20-1), 個資保護長 in agencies, audits, and a 6-year transition for sector regulators (51-1).
  - **Effective date: not set.** The law database says 「本法規部分或全部條文尚未生效，最後生效日期：未定」.
- **The PDPC is not established.**
  - Its organic act is not in the law database.
  - The 籌備處's written reply to the LY says the draft cleared joint committee review on 2025-05-28 and caucus negotiation on 2025-06-24, and 「尚待進一步協商」 (https://ppg.ly.gov.tw/ppg/SittingAttachment/download/2026051233/58060162042030240003.pdf). The two researchers date this reply differently; see §15.
  - On 2026-10-28, Executive Yuan officials said the 籌備處 「僅為法律解釋機關，並無個案調查執法權限」 (自由時報 via LINE Today, https://today.line.me/tw/v3/article/zNMo1P6).
  - The 籌備處 pre-announced six draft sub-regulations between 2026-01 and 2026-03 (https://www.pdpc.gov.tw/).
- **Practical effect.**
  - The previous text is in force: the 2023-05-31 version, https://law.moj.gov.tw/LawClass/LawOldVer.aspx?pcode=I0050021. Enforcement stays with sector regulators and local governments.
  - Today's security duty is **Art. 27(1)**, with fines up to NT$2M under current Art. 48(2). It becomes Art. 20-1 once the 2025 text takes effect.
  - **Re-check before launch and yearly.**

### 4.2 What counts as personal data, and why networks are special

- **Art. 2(1)** covers names, ID numbers, … 婚姻、家庭、教育、職業、…社會活動, 「及其他得以直接或間接方式識別該個人之資料」.
- **施行細則 §3.** Indirect identification is judged relative to what the **holder** can link (「須與其他資料對照、組合、連結等，始能識別」).
- **施行細則 §17.** 「無從識別特定當事人」 means the data are coded, anonymised or partly hidden so that 「無從辨識該特定個人」.
- **111憲判13** (2022-08-12), https://cons.judicial.gov.tw/docdata.aspx?fid=38&id=309956.
  - **¶35:** data that 「客觀上仍有還原而間接識別當事人之可能時，無論還原識別之方法難易…其仍屬個資」. Only data with **no objective possibility** of re-identification fall outside the PDPA.
  - ¶40 and ¶54 confirm that statutory "de-identified" data can still be personal data.
  - This is the strongest Taiwanese authority that **pseudonymised relational data are personal data**.
- **Networks as quasi-identifiers.** Degree sequences, ego-network shapes and timestamps act as quasi-identifiers. See Backstrom, Dwork & Kleinberg (WWW 2007) and Narayanan & Shmatikov (IEEE S&P 2009). Pseudonymised node ids do not take a person-level network out of the PDPA.
- **Art. 6 sensitive data** are prohibited except in listed cases: 病歷、醫療、基因、性生活、健康檢查、犯罪前科. Disease-contact, sexual-contact and co-offending networks fall here.

### 4.3 The site as a 非公務機關; health data

- **Status.** A private site is a 非公務機關 (Art. 2(8)). The household exemption (Art. 51(1)(1)) does not cover public publication.
- **Collection (Art. 19(1))** needs a purpose plus a ground. The relevant ones are:
  - (3) 自行公開/已合法公開 (公司法 §393, 政治獻金法 §21, LY votes, CEC results, award lists);
  - (4) research by an academic institution;
  - (6) public interest;
  - (7) 一般可得之來源, unless the subject's interest prevails;
  - (8) no infringement.
  - Art. 19(2) requires stopping on objection.
- **Use (Art. 20)** must stay within the purpose. Art. 5 (proportionality) still applies, so never enrich public-role data.
- **The research exception is probably unavailable.** Grounds 19(1)(4)/20(1)(5) belong to a **學術研究機構**, and a personally funded site is probably not one. [Rec] Rely on lawfully public data, public interest, a compatible purpose and a working objection process. University affiliation would change this.
- **Notice duties.** Art. 9(2)(2) and Art. 8(2)(6) remove the notice duty for legally published public-role data. [Rec] Require contributors of private-person data to attest that they handled Art. 8/9 duties or obtained consent.
- **111憲判13 holdings.**
  - Art. 6(1)(4) is constitutional.
  - The lack of an independent supervisor, the missing statutory basis for NHI data provision and the lack of an opt-out must each be fixed within 3 years. **The PDPC deadline (2025-08-12) was missed.**
- **全民健康保險資料管理條例.**
  - It was promulgated on 2025-12-19 and has been **in force since 2026-08-10** (行政院 115-08-06 院臺衛字第1151018599號; https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=L0060042).
  - Art. 3(4) defines 假名化; Arts. 8–9 set purpose and applicant limits; Art. 13 requires a secure environment.
  - **Art. 14:** results 「不得含有可識別個人身分之資料」, within the approved plan. Arts. 16–17 provide opt-out.
  - Consequence: NHIRD patient-level networks are never hosted. Aggregates are link-only, after the authors confirm release fits their plan.

### 4.4 Personal-data levels [Rec, Taiwan-data researcher; names as resolved in §14]

| Level (source tier) | What | Examples | Handling |
|---|---|---|---|
| none (A) | No personal data: infrastructure, aggregates, ecology, laws, sectors | TW-01–15, 26, 29, 30 | Re-host if the licence allows; otherwise link |
| public-role (B) | Identifiable people **acting in a public role**, legally published | legislators (TW-20–23), candidates (TW-24), nominees (TW-33), athletes (TW-28), scholarly authors (TW-19) | Re-host if the licence allows. Role-relevant attributes only, an objection channel, no enrichment |
| private-individuals (C) | Legally public data on private or semi-public individuals, or upstreams with deletion duties | directors (TW-16/17), donors (TW-25), project staff (TW-18 person level), judgments (TW-27), patent inventors | **Metadata and link only.** Optionally re-host a projection on legal persons or institutions |
| sensitive (D) | Art. 6 data; contact tracing; private-person social-media or messaging graphs (PTT/Dcard/FB/LINE); minors (school friendship networks); location traces | — | **Do not host.** List only when a research institution publishes under controlled access, and link to that gate, never to raw dumps |

- **Re-hosting rule.** Re-host only if three things hold: the licence permits redistribution; the level is none or public-role; and provenance is documented. Record the basis clause, e.g. "OGDL §2(2) + 附件 attribution", "CC BY 4.0", "ODC-By 1.0 §4.2", "LY 宣告 §1".
- **Anonymisation expectations.**
  - Pseudonymous ids are not anonymous (111憲判13 ¶35; 細則 §3).
  - Suppress or merge small cells (e.g. counts < 3) before re-hosting aggregates.
  - A person-level contributed network needs a de-identification statement, an IRB/REC reference where applicable, and the contributor's licence. Even then, default to link-only.
- **Agents.** Pages at the private-individuals level must not embed personal data in JSON-LD. Use dataset-level metadata only.

### 4.5 Takedown, precedents, and the 金馬 case

- **Procedure** [Rec, Taiwan-data researcher]:
  - a 個資與著作權申訴 page with email and a form;
  - acknowledge within 7 days and **suspend the file at once** (Art. 11(2) logic);
  - decide within **30 days, extendable once by 30** (as Art. 13(2));
  - remove on credible copyright notice;
  - mirror upstream removals by regular diffing;
  - keep a **tombstone** (id, title, reason, date) and a public change log.
- **Precedents.**
  - Netzschleuder marks 14 of 794 entries `restricted`: "Upstream does not permit data redistribution…" (e.g. https://networks.skewed.de/net/add_health).
  - Zenodo keeps "The DOI and the URL of the original object" on a tombstone (https://about.zenodo.org/policies/).
  - Common Crawl reserves removal rights and offers a CCBot opt-out (https://commoncrawl.org/terms-of-use , https://commoncrawl.org/faq).
  - SNAP publishes **no** licensing or takedown policy, a gap to avoid (https://snap.stanford.edu/data/).
  - ICON (https://icon.colorado.edu/) is a link-only index that delegates takedown upstream.
- **The 金馬 case.**
  - Names are personal data. Collection rests on Art. 19(1)(3)/(7) and is compatible with the announcement's public purpose (Art. 20). Notice is exempt (Art. 9(2)(2)), and there are no Art. 6 data. **Risk: low.**
  - Conditions [Rec]:
    1. only award-role facts, no enrichment;
    2. a correction channel;
    3. **fix provenance**: get written permission from the jinma.today operator, or rebuild from the official announcement, then release as the owner's compilation under CC BY 4.0 or CC0;
    4. state "nodes are real, publicly announced persons".
  - Re-host only after step 3 and after the owner confirms who compiled the JSON.
- **Crawling course systems.**
  - 刑法 §358–360 cover password misuse, 破解使用電腦之保護措施 and damaging interference. §361 adds up to half for 公務機關 computers; §363 makes them 告訴乃論 (https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=C0000001, 修正 115-07-22).
  - [Rec] Never bypass logins or CAPTCHAs; stop if a school objects.
  - Instructor names may be listed under Art. 19(1)(3)/(7) with a correction channel. Never collect student data.

---

## 5. Metadata schema survey

### 5.1 Comparison (verified 2026-11-04)

| Standard / catalog | Size or version | Structure encoding | Licence | Versions | Lesson taken | Source |
|---|---|---|---|---|---|---|
| **Netzschleuder** | 794 entries (885 modules in git, HEAD 5a28e07) | **Computed** `analyses` (num_vertices, num_edges, is_directed, is_bipartite, global_clustering, degree_assortativity, largest_component_fraction, edge_reciprocity, diameter …); weighted, temporal and other properties only as 65 free tags that mix domain and structure. Files `.gt.zst`, GraphML, GML, CSV zip | Not in the API. Module `upstream_license`: 450 of 833 `None`, the rest inconsistent free text. 14 entries `restricted` | git | Controlled licence id; keep "may we redistribute" separate; compute statistics; always record the upstream; a form that opens an issue is a proven intake | https://networks.skewed.de/about ; https://git.skewed.de/count0/netzschleuder |
| **ICON** | 699 records; 6 domains, 56 subdomains with case duplicates | Comma string of 17 properties; short `nodeType`/`edgeType` | none (index only) | `v` counter | `semantics.node`/`.link`; enums. **Its public API returns contributor emails: never put contact data in public records** | https://icon.colorado.edu/ |
| **SNAP** | 137 rows in 22 groups | Free-text type ("Unirected") | none | none | A fixed statistics block; avoid free text | https://snap.stanford.edu/data/ |
| **KONECT** | "1,326 network datasets in 24 categories" (Wayback 2026-10-18); timed out 2026-11-04; code last pushed 2023-02-26 | `sym`/`asym`/`bip` plus weight codes (`posweighted`, `signed`, `multiweighted`, `dynamic` …); hypergraphs as bipartite graphs | none | none | Weight semantics deserve a field. Catalogs die: keep `same_as` and upstream URLs | https://web.archive.org/web/20261018055623/http://konect.cc/ ; https://github.com/kunegis/konect-handbook |
| **XGI-data / HIF** | 51 entries | Computed statistics. **HIF** requires only `incidences[{edge, node, …}]`; `network-type` ∈ {undirected, directed, `asc`} | Zenodo record | version DOI 10.5281/zenodo.21905305 + concept DOI 10.5281/zenodo.10155872 | Version + concept DOI; HIF as the canonical higher-order format | https://github.com/xgi-org/xgi-data ; https://github.com/HIF-org/HIF-standard ; doi:10.1017/nws.2025.10018 |
| **AHORN** | 83 datasets | `suggested-network-types` **list** (hypergraph 75, simplicial-complex 44, graph 2, combinatorial-complex 1); faceted tags incl. `lifting: clique complex` | Zenodo | revisions with a changelog | Kinds as a list; record "lifting"; changelogs per version | https://ahorn.rwth-aachen.de/api/datasets.json |
| **PrefLib** | — | SOC/SOI/TOC/TOI/CAT/WMD with self-describing headers; modification types original/induced/imbued/synthetic | none | modification date | Ordinal rankings and pairwise outcomes are different kinds | https://www.preflib.org/format |
| **schema.org Dataset / Google Dataset Search** | Google page updated 2026-09-08; schema.org 30.1 | `variableMeasured` applies to Dataset; `additionalProperty` does not; `sha256`/`contentSize` on DataDownload | `license` as a versioned URL | `version` | Required `name` and `description` (**50–5000 characters**); `citation` is for related articles. **Since 2025-11-05 Dataset markup is used only by Dataset Search** | https://developers.google.com/search/docs/appearance/structured-data/dataset ; https://developers.google.com/search/updates |
| **DCAT v3** | W3C Recommendation 2024-08-22 | `dct:type`, `dcat:theme` | `dct:license`, `dct:accessRights` | `dcat:version`, `previousVersion`, `hasVersion` | One catalog JSON-LD plus Turtle; S3 cannot do content negotiation | https://www.w3.org/TR/vocab-dcat-3/ |
| **Croissant** | **1.1 (2026-01-29)**; `mlcroissant` 1.1.1 | **No graph vocabulary**: nodes and edges as two RecordSets with `references` (verified end to end) | SPDX URL | semver with data meaning | Emit only for hosted tabular versions. `mlcroissant validate` errors without sha256/md5. HF emits 1.1; Kaggle and OpenML 1.0 | https://github.com/mlcommons/croissant/blob/main/docs/croissant-spec-1.1.md ; https://docs.mlcommons.org/croissant/ |
| **Frictionless Data Package** | v2.0 (2024-06-26) | Table Schema with keys | `licenses[]` | `version` | The manifest inside a CSV bundle (`https://datapackage.org/profiles/2.0/datapackage.json`) | https://datapackage.org/overview/changelog/ |
| **DataCite** | **4.7 (2026-03-03)** | ResourceType; TechnicalInfo | Rights + SPDX scheme | IsNewVersionOf / IsVersionOf | Mandatory: Identifier, Creator, Title, Publisher, PublicationYear, ResourceType; roles from `contributorType` | https://schema.datacite.org/ ; https://datacite-metadata-schema.readthedocs.io/en/4.7/properties/overview/ |

### 5.2 Proposed record design [Rec, schema researcher, amended by §14]

**Prototype (run, not just written).**
- A JSON Schema 2020-12 compiles under ajv 8.20.0 in strict mode.
- Five example records, two version manifests and two person records validate, and 13 negative cases are rejected. Examples: an unquoted `1.10`, NOASSERTION with license-permits, a missing English title, a person with an email.
- The emitter produces schema.org JSON-LD, DCAT v3 (converted to Turtle with jsonld 9.0.0 + n3 2.13.12) and Croissant 1.1, which validates and loads all 146 edges and 174 nodes from the real zip.

**Required for `status: published`** (13 groups, ~15 minutes for an external record):
- `id`, `status`, `added`;
- `title.zh-Hant` and `title.en`;
- `description.zh-Hant` ≥ 50 characters;
- `semantics.node`/`.link`;
- `structure.kinds` (+ `directed`/`weighted` for graphs);
- `domains`;
- `taiwan_relevance` (basis + justification);
- `provenance.source`;
- `license.id`, `redistribution.basis`, `personal_data.level`.

A wanted record needs only id, status, added, zh title, a short description, domains and `wanted.reason`.

**Key design choices.**
- **Humans declare structure; the pipeline computes counts and statistics** into machine-written, append-only version manifests. These carry `changelog`, `doi`, a content-addressed `upstream_snapshot` reference, `distributions[]` with per-file `contents[]` checksums (Croissant needs them), and `statistics`. CI allows only adding `withdrawn` or filling `doi` after merge.
- **Kinds** are graph, hypergraph, simplicial-complex, cell-complex, ranking, pairwise-comparison or other-relational. A list is allowed; the first item is native.
- **Properties are fields, not kinds:**
  - directed, weighted, signed, multi_edges, self_loops, partite/partitions;
  - layers (single/multiplex/multilayer);
  - temporal (none/snapshots/event-times/intervals);
  - spatial (none/node-coordinates/areal-units/edge-geometry);
  - `simplicial` {max_dimension, stored, lifting};
  - `ranking.data_type` (PrefLib codes);
  - `comparison.outcome` (win-loss/win-loss-draw/score/margin/preference-strength).
- **`taiwan_relevance.basis`** ∈ {collected-in-taiwan, about-taiwanese-entities, taiwanese-publisher, taiwan-based-creators, taiwan-subset}.
- **Organisations.** Many Taiwanese bodies (TWNIC, 立法院, 金馬, CPBL) have **no ROR id** (ROR API, 2026-11-04), so Wikidata QIDs are the fallback. NTU is https://ror.org/05bqach95.
- **Person records** have no contact fields at all: `additionalProperties: false`. People without display consent are dropped from every public output.
- **Nine bilingual domains:** society 社會關係, politics 政治與治理, culture 文化、媒體與運動, economy 經濟與產業, transport 交通與移動, technology 科技與基礎設施, information 資訊與知識, life 生物與生態, health 健康與醫療. They crosswalk to ICON, Netzschleuder, KONECT and the old 6 headings. Subdomains go in open tags; structure never goes in tags.
- **Dataset ids** are permanent ASCII kebab-case slugs. Renames go through `aliases`, and an append-only `ids.lock` reserves every id ever issued. The schema's major version sits in the `$schema` path.
- **YAML traps** (`yaml` 2.9.1):
  - `version: 1.10` parses as 1.1, so version fields are strings.
  - Flow maps split on ASCII commas.
  - `|` blocks keep newlines inside Chinese, so join CJK lines without a space.
- **Validation.**
  - ajv 2020 + `ajv-formats` 3.0.1, called from a script (`ajv-cli` 5.0.0 was last published in 2023).
  - Cross-file checks: file name = id; unique ids and aliases; SPDX membership; references resolve; link-only records have no versions; hosted records have creators; manifests immutable.
  - A weekly link check that only opens issues.
- **Mappings (excerpt).**
  - zh title → schema.org `name`, en title → `alternateName`.
  - `domains` → `dcat:theme`.
  - `provenance.source` → `isBasedOn` / `prov:wasDerivedFrom` / DataCite IsDerivedFrom.
  - `license.attribution` → `creditText`.
  - `redistribution.basis` → `conditionsOfAccess` / `dct:accessRights`.
  - `personal_data` → Croissant `rai:personalSensitiveInformation`.
  - DOIs → `identifier` / DataCite IsVersionOf.
  - Distributions → DataDownload `contentUrl`, `contentSize`, `sha256` and `dcat:downloadURL`/`spdx:checksum`.
  - **`upstream_snapshot` is never exposed.**

**Data-quality facts from the worked examples** (verified 2026-11-04):
- **LY 10th term** (7,246 of LYAPI's 30,137 委員提案):
  - 122 nodes, of which **4 are party caucuses**; 118,317 incidences; 4,506 distinct member sets.
  - 43 empty bills, 44 without a 提案人, one dated 2013-04-19.
  - Edge size 0–61 (mean 16.33); degree 5–2,588. The HIF validates.
- **CPBL 2025:** 6 teams, 360 games (https://taiwannews.com.tw/news/6050927), 2 ties (https://en.wikipedia.org/wiki/2025_CPBL_season), 2025-03-29 to 2025-10-06.
- [Rec] Quirks like these belong in `structure.notes`.

**Contribution intake facts.**
- GitHub Issue Forms are still "**public preview** and subject to change" (https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/syntax-for-issue-forms), and two draft forms validate against https://json.schemastore.org/github-issue-forms.json.
- Fields can be prefilled by URL, but `labels` cannot be set by visitors (https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/creating-an-issue).
- Google Forms prefill uses `…/viewform?usp=pp_url&entry.<id>=<q>` (https://support.google.com/docs/answer/2839588).
- Issue→PR automation (`stefanbuck/github-issue-parser` v3.2.5, `peter-evans/create-pull-request` v8.1.1) is phase 2.
- Wanted records are seeded from the old 搜集中 items: 課業諮詢網絡, 人口遷徙, 港口貿易, 生物食物鏈, 縣市路網, 航空路線, 文獻引用網絡. 👍 counts serve as votes. The channel decision is in §14.

---

## 6. Curation pipeline, snapshots, re-host classes, PIDs and DOIs

### 6.1 Stages [Rec, curation researcher]

The pipeline runs ten stages:
1. discover;
2. triage and licence gate;
3. fetch;
4. snapshot;
5. parse and convert;
6. statistics;
7. manifest and integrity;
8. review and publish, behind a GitHub Environment with a required reviewer;
9. deposit, where CI drafts the Zenodo record and the maintainer clicks Publish;
10. monitor.

Plain HTTP/API work runs in CI. Forms, captchas, large conversions, outreach and anything personal run on the maintainer's laptop.

### 6.2 Discovery (probed 2026-11-04/05)

| Source | Access and limits |
|---|---|
| OpenAlex `api.openalex.org/works?filter=authorships.institutions.country_code:TW,…` | A free key gives **$1/day** (list $0.10 per 1,000, search $1 per 1,000), 30 req/s; keyless is $0.10/day, and paging past page 1 needs a key (https://help.openalex.org/api/authentication/ , https://help.openalex.org/access/example-costs/; keys announced as required from 2026-02-13, https://groups.google.com/g/openalex-users/c/rI1GIAySpVQ) |
| Semantic Scholar bulk and snippet search | A key starts at 1 req/s (https://www.semanticscholar.org/product/api) |
| DataCite `api.datacite.org/dois?query=…&resource-type-id=dataset` | Open. Covers Zenodo, Figshare, Dataverse, OSF and SRDA (10.6141, 3,232 DOIs, https://api.datacite.org/providers/yozl); **not SciDM** (Airiti) |
| Zenodo, Figshare, Dataverse, OSF (`share.osf.io/trove/…`) | Open. Zenodo `Taiwan AND network` datasets: 52 hits. Figshare is noisy |
| GitHub search | Authenticated: 30/min, code search 10/min |
| depositar CKAN 2.10.11 | API open; **the web UI is behind the Anubis proof-of-work wall** |
| SciDM CKAN **2.7.6** | Large queries time out after 90 s |
| Google Dataset Search | **No API**; automated querying conflicts with Google's ToS (https://support.google.com/webmasters/thread/8816828). Manual only |

**The weekly sweep [Rec].**
1. A deterministic bilingual harvest (網絡, 網路, 社會網絡, 共同作者, 引用網絡, 超圖, 排名, 交通 … × Taiwan/臺灣/台灣 or `country_code:TW`), deduplicated against `seen.jsonl`.
2. LLM triage with Claude Code headless or `anthropics/claude-code-action@v1` (https://github.com/anthropics/claude-code-action). It drafts candidates with **licence evidence (URL plus a verbatim quote)**.
3. A validator sets the licence class **deterministically from the SPDX id**.
4. A PR goes to the maintainer.

**Guardrails.**
- **No auto-publish**: the job has no Zenodo or AWS credentials and touches only its own branch and folders.
- A missing licence quote means link-only.
- **Dedup keys** in order: `doi:`, `datagovtw:`, `ckan:`, `zenodo:`, `github:`, `paper:`, normalized `url:`, then `content:sha256:`.
- **Prompt-injection hygiene**: no shell, no push, capped turns.
- **No researcher contact data ever reaches an LLM.**
- "In a public repository, scheduled workflows are automatically disabled when no repository activity has occurred in 60 days" (https://docs.github.com/en/actions/how-tos/manage-workflow-runs/disable-and-enable-workflows).

### 6.3 Fetch, snapshot, convert, verify [Rec unless verified]

- **Recipes** list each source's method (get/post/form/api/git/manual), URL, the expected sha256/bytes once pinned, the retrieval date, the landing page and the cadence. A changed hash fails the job and opens an "upstream changed" issue.
- **Forms.** TWNIC's GML (verified 2026-11-05) is a POST from `https://map.twnic.net.tw/gml/query.php?d=gml` to `/gml/gml2.php` with a hidden **`token`**; without it the server returned 301 with an empty body. So GET the form, keep cookies, copy the hidden fields, then POST. Captcha portals become `manual`, and CI only verifies the stored copy.
- **Politeness.**
  - UA `netscied-bot/1.0 (+https://netscied.tw/bot; <contact email>)`.
  - robots.txt honoured; ≤ 1 request/s per host.
  - Conditional GET; backoff honouring `Retry-After`.
  - Government sites outside UTC+8 office hours.
- **Snapshots** follow §14. Save Page Now 2 facts (doc "updated 2026-07-22", https://docs.google.com/document/d/1Nsv52MvSjbLb2PCpHlat0gkzw0EvtSgpKHu4mk0MnrA): `POST https://web.archive.org/save`, **7 captures/min** authenticated, max resource 2 GB, **5 GB/day per user**. It suits landing pages, not data files.
- **The private bucket** has public access blocked, SSE, versioning and a 180-day lifecycle on `pending/`.
- **Conversion.**
  - `nodes.csv` keeps `index` 0..N−1 *and* the upstream `id`, so conversions are lossless.
  - Never deduplicate multigraphs silently.
  - Times are ISO 8601 with offset; layers are a `layer` column plus `layers.csv`.
  - Simplicial complexes store facets only.
  - **GML is not safe for 中文**, because its ASCII spec mangles non-ASCII.
- **Netzschleuder's pipeline** (AGPL-3.0) is `do_all.py` = fetch → parse → convert → analyze → draw, with commit trailers `Changed: upstream`, an orphan-only `mirror.py`, and `check_upstream.py` comparing lengths without checksums. [Rec] Borrow the recipe-per-entry design, the trailers and the size gates.
- **Toolchain** (PyPI 2026-11-04): networkx 3.7, igraph 1.0.0, xgi 1.0.0, rocrate 0.16.0, warcio 1.8.2, pinned with uv. **graph-tool is not pip-installable** (its PyPI v2.11 has no files, https://pypi.org/project/graph-tool/), so `.gt` comes from a separate conda or Docker job. XGI HIF I/O: https://xgi.readthedocs.io/en/latest/_modules/xgi/readwrite/hif.html.
- **Statistics gates.**
  - O(N+E) statistics always.
  - Triangles at E ≤ 5×10⁷.
  - BFS pseudo-diameter at N ≤ 10⁷ with 1,000 samples.
  - Spectral statistics optional at E ≤ 10⁷.
  - Community and SBM fits never in CI.
  - Simplicial complexes: no face expansion; Euler characteristic only for max facet ≤ 10.
  - Rankings: report completeness, ties and comparison-graph connectivity (Bradley–Terry needs it).
- **Integrity.**
  - The manifest holds path, role, bytes, sha256 and md5 (Zenodo stores MD5, https://about.zenodo.org/policies/), plus `SHA256SUMS`.
  - A weekly re-hash below 1 GB; sampled range checks above, with a monthly full re-hash.
  - A cross-check with Zenodo checksums.
  - No git file over 5 MB.
- **Immutability.** Published versions never change, and a correction is a new version. A legal or PDPA takedown removes the files but keeps the manifest and a tombstone. Zenodo allows file changes only within 30 days, or later "in duly justified cases, such as copyright infringement or exposure of personal data" (https://help.zenodo.org/docs/deposit/manage-files/). The concept DOI resolves to the latest version (https://zenodo.org/help/versioning).
- **Upstream checks** (weekly): ETag, Last-Modified and Content-Length, then sha256; `modifiedDate` for data.gov.tw; `metadata_modified` for CKAN; the latest Zenodo version; the GitHub release. A human decides whether to cut a version.
- **Provenance per version.**
  - Sources with Wayback URLs and licence evidence; pipeline commit and `uv.lock` hash; the run; steps with hashes; human-readable `transformations[]`, which satisfy CC "indicate modifications" and ODbL 4.6.
  - Maps to PROV-O. RO-Crate is a generated export (ro-crate-py; RO-Crate 1.2 published 2025-06-04, https://www.researchobject.org/ro-crate/specification/1.2/index ; https://www.researchobject.org/workflow-run-crate/).
  - Code is archived with Zenodo GitHub DOIs (https://help.zenodo.org/docs/github/) and Software Heritage. **SWHID = ISO/IEC 18670:2025 since 2025-04-23** (https://www.iso.org/standard/89985.html).
- **GitHub Actions** (2026-11-04):
  - Free and unlimited for standard runners on public repos (https://docs.github.com/en/billing/concepts/product-billing/github-actions).
  - Linux runner **4 vCPU / 16 GB / 14 GB SSD** (https://docs.github.com/en/actions/reference/runners/github-hosted-runners).
  - 6 h job limit (https://docs.github.com/en/actions/reference/limits).
  - Test deposits on `sandbox.zenodo.org` (https://developers.zenodo.org/).
- **`ATTRIBUTION.txt` per version:** 「本資料由 {creators} 蒐集，原始發布於 {source}，依 {license} 授權。netscied.tw 於 {retrieved_at} 取得並轉換為 {formats}；變更：{transformations}。轉換後版本依 {license} 釋出。{OGDL 顯名聲明 / ODbL notice}」. Our own metadata can be CC0, as Zenodo's is.

### 6.4 Licence classes (names as adopted in §14; the curation researcher's letters in brackets)

| Class | Upstream condition | Re-host original | Lossless conversions | Cleaned / derived variants | Zenodo deposit | Our files' licence |
|---|---|---|---|---|---|---|
| **permissive** (A) | CC0, PDDL, public domain, CC BY (incl. CC BY 3.0 TW), ODC-By, CDLA-Permissive, **OGDL v1** | yes | yes | yes | yes | Same as the upstream. OGDL derivatives may be CC BY 4.0 (§4(2)) |
| **share-alike** (B) | CC BY-SA, ODbL, CDLA-Sharing | yes | yes | yes, **same licence** | yes | Same as the upstream. Never merge BY-SA and ODbL sources into one composite. Statistics and figures are ODbL "Produced Works" (4.3 notice only) |
| **non-commercial** (C) | CC BY-NC, BY-NC-SA | yes, because the site is non-commercial (no ads, fees or paid tiers) | yes | yes (NC-SA: same licence) | yes | Same NC licence; label 「非商業使用」. **Re-evaluate if the site ever takes ads or sponsorship** |
| **no-derivatives** (D) | CC BY-ND, BY-NC-ND | yes (verbatim) | **only lossless conversions keeping every id and attribute** (CC 4.0 §2(a)(4)) | **no** (no cleaning, subsetting or LCC extraction) | yes | Same ND licence. Label conversions 「格式轉換，內容未修改」. Statistics are facts (researcher's view) |
| **link-only** (E) | No licence; all rights reserved; terms forbidding redistribution; "available on request"; registration-gated archives (e.g. SRDA); publisher-copyright supplements; **platform-ToS-restricted data** (scraped social media and forums) | no | no | no | no | n/a. The default for anything unclear; start outreach |
| **permission** (F) | link-only plus a recorded written permission `perm-…` with evidence | per the scope | per the scope | per the scope | **only if the grant is an open licence**. Ask for CC BY 4.0 or CC0, which turns F into permissive. A netscied-only grant means an access copy, no deposit | As granted. **The author's permission does not cure third-party ToS or third-party personal data** |
| **personal-data hold** (G) | Personal data needing review (identifiable ties; Art. 6 categories); security-sensitive infrastructure topology | no, until cleared | — | — | — | Overrides all other classes; blocks publishing in CI |

The mapping from SPDX to class is a deterministic table in code; `unknown` or `null` means link-only. The permission class needs a non-null permission reference whose status reads `granted`. The hold is set by the personal-data review.

### 6.5 PID and DOI services (as of 2026-11-04)

| Service | DOI | Limits / cost | Fit |
|---|---|---|---|
| **Zenodo** | DataCite 10.5281; version DOIs + concept DOI (https://zenodo.org/help/versioning) | **50 GB and 100 files per record**, up to 200 GB on request (https://help.zenodo.org/docs/deposit/manage-files/ , https://about.zenodo.org/policies/); free. "lifetime of the repository … CERN … next 20 years at least"; MD5 fixity | **Best primary archive.** Depositors need "appropriate rights". **"content found to already have an external DOI will have the Zenodo DOI invalidated"**: never re-deposit identical copies |
| **depositar** (中研院) | **No; ARKs** (https://docs.depositar.io/en/stable/user-guide/ark-identifier.html) | ~1 GB per file (https://docs.depositar.io/en/stable/user-guide/limitation.html); free; "kept as long as the depositar is in service" (https://demo.depositar.io/en/); 「實驗性質」 (https://data.depositar.io/about); re3data r3d100013208 | Taiwan-hosted secondary mirror. Contact them before primary use, and no bulk republishing without consent (https://rdm.depositar.io/terms_of_use/) |
| **SciDM** (NCHC) | Per curation: yes, free, for NCHC-approved organisations, **via Airiti** (10.30193; https://scidm.nchc.org.tw/pages/doi , https://doi.org/ra/10.30193). Per storage: none seen (§15) | 2 GiB upload (https://scidm.nchc.org.tw/api/3/action/status_show); account needs 18+, SMS and an organisation application (https://scidm.nchc.org.tw/uploads/page_images/2024-06-25-132042.067320.v2024.06.pdf ; https://www.nchc.org.tw/Page?itemid=7&mid=11) | Not primary: outside DataCite, old stack. Harvest it |
| **Airiti** 華藝 | The Taiwan RA (https://www.doi.org/the-community/existing-registration-agencies/) | **Paid, institutions only**: 「以機構為單位的DOI註冊」 (https://doi.airiti.com/JoinUs/MemberPlan , https://doi.airiti.com/AboutDOI/DOIPolicy) | Not usable. No RA named "TAIWAN DOI" exists |
| **Harvard Dataverse** | DataCite 10.7910 | 2.5 GB per browser file, 1 TB free per researcher (https://support.dataverse.harvard.edu/researchers , https://support.dataverse.harvard.edu/large-data-support) | Fallback |
| **Figshare** | yes | 20 GB / 500 items free (https://info.figshare.com/user-guide/account-limits/); Figshare+ $1,225 per 250 GB (https://info.figshare.com/figshare-plus/) | **The free tier offers only CC0 and CC BY 4.0**, so no BY-SA, ODbL or NC |
| **OSF** | via DataCite | 50 GB per project, 5 GB per file (https://help.osf.io/article/353-welcome-to-projects , https://help.osf.io/article/555-add-ons-storage-api-integration-faq-s) | "OSF does not currently support DOI versioning" (https://datamanagement.hms.harvard.edu/share-publish/data-repositories/open-science-framework) |
| **Software Heritage** | SWHID (ISO/IEC 18670:2025) | free | For pipeline code |

**DOI practice [Rec].**
- One concept DOI per hosted dataset and one version DOI per version, in a `netscied` community. CI drafts; the maintainer publishes.
- If the upstream has a DOI, cite it, and deposit only a derived package (`IsDerivedFrom`).
- Never deposit NOASSERTION data. Think twice above public-role: DOIs are permanent.
- Use test prefix 10.5072 in examples.
- Optional: a `w3id.org/netscied/` redirect namespace [Rep], and depositar mirrors with ARKs.
- **Crediting in DOI metadata.**
  - For light repackaging, `creators` are the original collectors as cited (ORCID only with consent), and the maintainer is a `DataCurator` contributor. Add the line "The listed creators collected the original data; they did not prepare this deposit…".
  - For new compilations, the maintainer is creator and the agencies are organisational `DataCollector` contributors, plus the 顯名聲明.

---

## 7. Researcher log and the PDPA duties for holding it

### 7.1 Structure [Rec, curation researcher; ids and credit as resolved in §14]

- **Person ids** are `p-` plus 8 random Crockford base32 characters (e.g. `p-7K3M9QZ2`), generated once and never derived from a name or email; dictionary attacks reverse email hashes. Organisations get `o-…`.
- **Bibliographic credit** (names as published in a cited work) always shows on dataset pages. It needs no consent: it is 當事人自行公開 data used for its citation purpose.
- **Person credit records** (affiliation, ORCID, homepage) appear only with recorded consent. No separate researcher profile pages are built in this change (§14).
- **Private record fields:**
  - names (zh, en, as-published variants), affiliation with ROR and an as-of date, ORCID, homepage;
  - a `public_profile` block, the only one the export may read: display flag, consent reference and date, chosen fields;
  - **contact**: each email with its source URL, collection date and legal basis (e.g. "19-1-3 自行公開"). A phone number only if offered;
  - `outreach[]`: date, channel, direction, notice template version, message id, summary, evidence file;
  - `permissions[]`, `status`, `next_follow_up`, minimal factual notes;
  - `pdpa`: purposes, categories, notice version and date, retention rule, and requests log.
- **Permission records.**
  - Grantor, rights-holder confirmation, evidence and form version.
  - Status: needed / requested / granted / granted_limited / declined / no_response / withdrawn.
  - Scope: redistribute, licence granted, convert, clean, Zenodo, creator listing, ORCID in DOI.
- **Public export.**
  - A local script writes only consented, allowlisted fields into the public repo, and the maintainer reviews the diff in a normal PR.
  - Public CI applies a JSON Schema with `additionalProperties: false` and a regex scan for `@` emails and `+886`/`09xx` phone patterns, and **fails the build** on a hit.
  - There is no cross-repo token.

### 7.2 Where the private part lives

| Option | Facts | Verdict [Rec] |
|---|---|---|
| **Private GitHub repo** | Free. GitHub.com stores data in the USA by default; in-region residency requires Enterprise Cloud (https://docs.github.com/enterprise-cloud@latest/admin/data-residency/about-github-enterprise-cloud-with-data-residency ; https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement). History gives an audit trail | **Recommended**: 2FA/passkey, no third-party apps, **no Actions** |
| sops + age inside the public repo | sops encrypts **values only; keys stay in cleartext** (https://getsops.io/docs/reference/ ; https://getsops.io/docs/usage/identities/age/). The ciphertext is public forever, and metadata leaks | **Reject** for personal data |
| Private S3 bucket (ap-east-2) | Keeps data in Taiwan | Backup target and large evidence scans only |
| Local SQLite or Obsidian + backup | One device, no review diffs | Second choice |

- **Also rejected:** Google Sheets (no schema or audit; https://support.google.com/drive/answer/37603), Airtable (Free allows 1,000 API calls/month; https://support.airtable.com/articles/2277136852-airtable-plans-overview) and Notion (block caps; https://www.notion.com/pricing).
- **Backups [Rec].** A monthly `git bundle` encrypted with `age` goes to the private bucket, keeping 12 versions, plus FileVault and Time Machine. Keep the age key offline in two places.
- **Erasure caveat.** A 刪除 request means `git filter-repo`, a force-push, and deleting or aging out backups. The notice should state the 12-month backup window.

### 7.3 PDPA duties for a natural-person controller (text verified unless noted; §4.1 for which text is in force)

| Topic | Rule | What the maintainer does [Rec] |
|---|---|---|
| Controller | The maintainer is a 非公務機關 (第2條第8款 "前款以外之自然人、法人或其他團體"); the household exemption does not apply | — |
| Specific purpose | 第19條/第20條; codes from https://law.pdpc.gov.tw/LawContent.aspx?id=FL010631 | Purposes **〇六九** 契約…法律關係事務, **一三六** 資（通）訊與資料庫管理, **一五九** 學術研究, **一七六** 其他自然人基於正當性目的…. Categories C001, C038, C054, C056, C061, C102, C132 |
| Lawful basis | 第19條第1項第3款 (自行公開/已合法公開), 第5款 (consent), 第7款 (一般可得之來源; 細則第28條 includes "網際網路"). 細則第13條: 已合法公開 means disclosure under law | **Copying a work email from a university page is collection** (第2條第3款). It is lawful under 第3款 or 第7款. 第7款 carries an opt-out: honour "don't contact me" at once. Don't rely on 已合法公開 for web pages |
| Notice | 第8條 items 1–6 (direct); 第9條 (indirect): source plus items 1–5 **before use**, or at first use (第9條第3項). 第9條第2項第2款 exempts 自行公開/已合法公開 but **not** 一般可得之來源. 細則第16條 allows email | Put the notice in the first outreach email |
| Consent | 第7條第1項; **第7條第4項: the collector bears the burden of proof**; 細則第14條: electronic consent under 電子簽章法 | Keep the `.eml` or signed PDF. Explicit opt-in for profile display |
| Security | Now **第27條第1項**; later 第20條之1. 細則第12條 lists 11 measures, applied proportionally. Fines up to NT$2M under current 第48條第2項 | Data inventory; 2FA; FileVault; private repo; least data; no contact data in LLM tools; incident plan; annual review |
| Breach | Current 第12條: notify affected people. The amended 第12條 adds authority reporting (not in force) | Template email; incident log |
| Retention | 第11條第3項, 細則第20條, 第11條第4項 | Contact details deleted **24 months** after the last unanswered contact. On decline, delete within 30 days and keep a do-not-contact line. Consent and permission evidence kept while the credit or copy is public, **plus 5 years** (第7條第4項; 第30條 damages limit) |
| Data-subject rights | 第3條 (non-waivable). 第13條: **15 days** for 查詢/閱覽/複製, **30 days** for 更正/停止/刪除, each extendable once. 第14條 allows cost recovery | Log requests; target 7 days |
| Cross-border | 第21條: the authority *may* restrict | Name the locations in the notice: GitHub (US), AWS Taipei, Zenodo (Switzerland/Hungary) |
| Processors | 第4條 | Record GitHub and AWS in the inventory |
| Penalties | 第47–48條; 第29條 presumed-fault civil liability (NT$500–20,000 per person per incident when damage is hard to prove) | Low risk at this scale if followed |

### 7.4 Notice template (first outreach email) [Rec]

> 主旨：netscied.tw 擬引用／轉載您的研究資料，並依個資法告知蒐集事項
>
> ○○○ 老師您好：
>
> 我是顏子祺。我以個人身分維護「台灣網絡科學教育」(netscied.tw)，這是一個非營利的臺灣網絡資料搜尋與典藏網站，收錄圖、超圖、排名等關係資料。我從〔您於 20XX 年發表之〈論文題名〉（DOI：…）之資料可得性聲明〕得知您蒐集了「〔資料集名稱〕」。我想請教您以下三件事，三件事彼此獨立，您可以只同意其中幾項，也可以全部拒絕：
> 1. 在本站資料集頁面以您的論文作為資料來源並標示作者姓名（此為一般學術引用）；
> 2. 是否同意本站保存一份資料副本、轉換為通用格式（CSV、GraphML、HIF 等），並存放於 Zenodo 取得 DOI；
> 3. 是否同意在本站「資料蒐集者」頁面顯示您的公開簡介（您可選擇顯示哪些欄位）。
>
> 【個人資料蒐集告知事項】（個人資料保護法第8條、第9條）
> 一、蒐集者：顏子祺（自然人，經營「台灣網絡科學教育 netscied.tw」），聯絡信箱：〔專用信箱〕。
> 二、蒐集目的：資料目錄之維護與資料來源標示、資料轉載授權之聯繫與紀錄（特定目的：〇六九 契約、類似契約或其他法律關係事務；一三六 資（通）訊與資料庫管理；一五九 學術研究；一七六 其他自然人基於正當性目的所進行個人資料之蒐集處理及利用）。
> 三、個人資料類別：姓名、職稱、服務機關、工作地址、電子郵件（C001、C038、C061）；學術專長與著作（C054、C056）；授權與同意紀錄（C102）；與您往來之信件（C132）。
> 四、資料來源：您於〔○○大學○○系網頁／論文作者資訊〕公開之資料。
> 五、利用之期間、地區、對象及方式：（一）期間：至本計畫終止或您請求刪除時為止；若您未回覆，我將於最後一次聯繫後 24 個月內刪除您的聯絡方式；授權或同意之證明，於相關資料公開期間及其後 5 年內保存，以備舉證。（二）地區：臺灣，以及我所使用雲端服務之主機所在地（GitHub：美國；Amazon Web Services：臺北區域；Zenodo：瑞士、匈牙利）。（三）對象：您的聯絡資料與往來紀錄僅我本人可存取，不提供給第三人，也不會輸入任何人工智慧服務。只有經您明示同意公開的欄位（例如姓名、服務機關、ORCID、個人網頁）會顯示於本站及 DOI 詮釋資料。（四）方式：以電子方式儲存及處理，不作行銷用途。
> 六、您的權利：依個資法第3條，您可隨時請求查詢、閱覽、製給複製本、補充或更正，或請求停止蒐集、處理、利用及刪除您的個人資料。請直接回覆本信，我會在法定期限內（查詢、閱覽、複製 15 日內；更正、停止、刪除 30 日內）處理。
> 七、不提供之影響：您可自由決定是否回覆或提供資料。不回覆或拒絕不會對您造成任何不利影響；本站仍會依一般學術慣例，引用您已發表之論文書目。若您不希望再收到我的來信，請告知，我會立即停止聯繫。
>
> 敬祝 研安
> 顏子祺 敬上（告知版本：notice-v1，20XX-XX-XX）

Item 3 of the template asks about a 「資料蒐集者」 profile page. Under §14 this change builds no profile pages, so reword that item to ask about showing affiliation, ORCID and homepage on dataset pages.

**Consent-form outline (`consent-form-v1`) [Rec].**
1. Identification: name, dataset, upstream DOI/URL, form version, a notice-read checkbox.
2. Rights warranty: rights held or co-authors' and funder's agreement; identifiable persons and IRB scope; any platform ToS.
3. Redistribution, choose one:
   - **A.** An open licence (CC0 / CC BY 4.0 / CC BY-SA 4.0 / CC BY-NC 4.0). The form must **state that open licences are irrevocable**.
   - **B.** Permission to netscied.tw only.
   - **C.** No redistribution (citation and link only).
4. Processing allowed: conversion, statistics, cleaning options.
5. DOI deposit: listing role, ORCID in metadata, edit access.
6. Preferred citation.
7. Display of credit fields, as a separate consent (第7條第1項 + 第19條第1項第5款). Can be withdrawn at any time, with removal within 7 days.
8. Withdrawal: B and the display can be withdrawn; A cannot, but netscied removes its own copies and asks Zenodo for a tombstone where justified.
9. Signature, or an email reply 「我同意 consent-form-v1 之勾選內容」.

### 7.5 Workflow states [Rec]

- **Person:** identified → contact_found (basis recorded) → contacted (notice sent; follow-up at +21 days) → responded → consented_display / declined_display, or no_response (after 2 follow-ups) → dormant → contact purged at +24 months. At any time: do_not_contact or erased.
- **Permission (dataset × grantor):** not_needed (permissive through no-derivatives) | needed → requested → granted / granted_limited / declined / no_response / withdrawn.
- **Dataset:** candidate → triaged → licence-classed → [awaiting_permission] → fetched → converted → validated → pdpa_cleared → reviewed → published@version → deposited@doi. Then upstream_changed → a new version, or withdrawn (tombstone).

---

## 8. Storage and cost model

This section is reproduced from the storage-cost research. Every price was read from a primary source on 2026-11-04 unless marked otherwise. The model's arithmetic was re-run for this appendix (`cost_model.py`) and reproduces the results table.

The researcher's short answer [Rec]: S3 *storage* never gets expensive at this scale. Pay-as-you-go CloudFront *egress* could, and the flat-rate CloudFront plans (launched 2025-11-18) remove that risk. The prior "storage is cheap, egress dominates" is only half right:
- On pay-as-you-go it holds only past the 1 TB free CloudFront allowance (S3).
- On flat-rate, R2, B2 or Zenodo, storage dominates.

### 8.1 Verified prices (as of 2026-11-04)

**AWS S3.** Source: Price List API, publication 2026-11-04T17:44:45Z; offer index https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonS3/current/region_index.json; regional file e.g. https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonS3/20261104174445/ap-east-2/index.json. The S3 pricing page (https://aws.amazon.com/s3/pricing/) is JS-rendered.

| Item | us-east-1 | ap-east-2 **Taipei** | ap-northeast-2 Seoul (current bucket) |
|---|---|---|---|
| S3 Standard, first 50 TB | $0.023/GB-mo | **$0.0225/GB-mo** | $0.025/GB-mo |
| Standard-IA | $0.0125 (+$0.01/GB retrieval, 30-day min) | $0.01242 (+$0.01/GB) | $0.0138 |
| Glacier Instant Retrieval | $0.004 (+$0.03/GB retrieval, 90-day min) | $0.005 (+$0.03/GB) | $0.005 (+$0.03/GB) |
| Intelligent-Tiering | FA $0.023 / IA $0.0125 / AIA $0.004, + $0.0025 per 1,000 objects monitoring | FA $0.0225 / IA $0.01242 / AIA $0.005, + $2.50/M objects | not extracted |
| PUT/COPY/POST/LIST | $0.005 per 1,000 | $0.00423 per 1,000 | $0.0045 per 1,000 |
| GET | $0.004 per 10,000 | $0.000333 per 1,000 | $0.0035 per 10,000 |
| S3 → CloudFront transfer | $0.00 | free | free |

- **Taipei region.** Asia Pacific (Taipei) `ap-east-2` became GA on 2025-06-05 with 3 AZs (the curation report says 2025-06-06; §15) (https://aws.amazon.com/blogs/aws/now-open-aws-asia-pacific-taipei-region/). It is an **opt-in region** (https://docs.aws.amazon.com/global-infrastructure/latest/regions/aws-regions.html).
- **Data transfer out directly from S3** (AWSDataTransfer, publication 2026-11-03; https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AWSDataTransfer/20261103133147/ap-northeast-2/index.json):
  - The first **100 GB/month, aggregated globally**, is free for every account, separate from CloudFront's 1 TB (https://aws.amazon.com/s3/pricing/).
  - Beyond that, the first 10 TB: us-east-1 $0.090, Taipei $0.1083, **Seoul $0.126**.
  - Next tiers: us-east-1 0.085/0.070/0.050; Taipei 0.08455/0.0817/0.0798; Seoul 0.122/0.117/0.108.

**CloudFront pay-as-you-go** (https://aws.amazon.com/cloudfront/pricing/pay-as-you-go/; Price List 2026-10-19).
- **Always Free** for all accounts, with no expiry: 1 TB/month out, 10,000,000 HTTP/HTTPS requests, 2,000,000 Function invocations, 2,000,000 KeyValueStore reads, free SSL.
- "Free for origin fetches from any AWS origin such as Amazon S3…".
- **Price classes.** Price Class 100 excludes the Taiwan group, which is then served at the cheapest in-class rate with higher latency. Price Class 200 includes it.

| Tier ($/GB) | Taiwan group (HK, ID, PH, SG, KR, TW, TH, MY, VN) | US/MX/CA | Japan |
|---|---|---|---|
| First 1 TB | free | free | free |
| Next 9 TB | **$0.120** | $0.085 | $0.114 |
| Next 40 TB | $0.100 | $0.080 | |
| Next 100 TB | $0.095 | $0.060 | |
| Next 350 TB | $0.090 | $0.040 | |

- **Other charges.**
  - HTTPS requests per 10,000: Taiwan group $0.0120, US $0.0100.
  - Functions: $0.10 per 1M after 2M.
  - Invalidations: 1,000 paths/month free, then $0.005/path.
- **Limits.** The maximum cacheable file is **50 GB**. On-the-fly compression applies only to 1 KB–10 MB, so store large files pre-compressed (https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cloudfront-limits.html).

**CloudFront flat-rate plans** (launched 2025-11-18; https://aws.amazon.com/blogs/networking-and-content-delivery/introducing-flat-rate-pricing-plans-with-no-overages/ , https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/flat-rate-pricing-plan.html , https://aws.amazon.com/cloudfront/pricing/)

| Plan | $/month | Data transfer | Requests | S3 Standard credit | WAF rules | Route 53 extra queries |
|---|---|---|---|---|---|---|
| Free | $0 | 100 GB | 1 M | 5 GB | 5 | 1 M |
| Pro | $15 | 50 TB | 10 M | 50 GB | 25 | 5 M |
| Business | $200 | 50 TB | 125 M | 1 TB | 50 | 20 M |
| Premium | $1,000 (configurable to $10,000 for 600 TB / 6 B) | 50 TB | 500 M | 5 TB | 75 | 100 M |

- **Bundled in every plan:**
  - the distribution;
  - AWS WAF (a web ACL is **mandatory**) and always-on DDoS protection;
  - Route 53 hosted zone, records and queries when the zone is attached (ALIAS queries unlimited);
  - CloudWatch Logs ingestion (Pro and above), TLS, CloudFront Functions;
  - an S3 credit for the payer account;
  - waived origin transfer.
- **Overage.**
  - The docs say "you will not incur overage charges, regardless of how much you exceed your allowance".
  - A first spike up to 3× the allowance is accommodated once. Sustained excess is evaluated over 2–3+ months, after which "traffic delivery might be adjusted".
  - WAF-blocked and DDoS traffic does not count. Alerts go out at 50/80/100%.
  - **The legal text is softer.** AWS Service Terms §3.2 (updated 2026-11-03, https://aws.amazon.com/service-terms/): "AWS may take appropriate action, which may include reducing your performance (e.g. throttling) **or requiring a change to your pricing structure**."
- **Quotas.**
  - 100 plans per account, **at most 3 Free plans**, **1 apex domain per plan, 1 distribution per plan**.
  - Accounts "using AWS Free Tier" are not eligible.
  - Unsupported: OAI (use **OAC**), real-time logs, legacy cache settings, Shield Advanced.
  - Lambda@Edge, and Route 53 health checks beyond 50, stay pay-as-you-go.
- **More plan constraints, reported by the UX researcher** from the same pricing pages:
  - KeyValueStore is not in Free.
  - **Custom cache policies and custom response-header policies only from Business**; Free and Pro get managed ones.
  - Free has 5 cache behaviors, and its Route 53 allows 50 records per hosted zone.
  - [unverified] Custom error responses are not mentioned on the plan page.

**AWS Free Tier, Route 53, Budgets, WAF.**
- **The 2025-07-15 change.**
  - New accounts choose a Free plan (up to $200 credits, closing after 6 months) or a Paid plan.
  - Older accounts stay on the legacy program; Always Free continues for everyone.
  - Sources: https://aws.amazon.com/blogs/aws/aws-free-tier-update-new-customers-can-get-started-and-explore-aws-with-up-to-200-in-credits/ , https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/free-tier-plans.html , https://repost.aws/knowledge-center/aws-free-tier-account-start-expire.
- **Route 53:** $0.50 per hosted zone per month; $0.40 per 1M standard queries; alias queries to AWS free.
- **Budgets** (https://aws.amazon.com/aws-cost-management/aws-budgets/pricing/):
  - Monitoring is free, and the first 2 action-enabled budgets are free.
  - Data updates arrive "up to three times a day… typically 8–12 hours after the previous update" (https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-managing-costs.html).
  - **Budgets alert; they do not cap**, and cannot stop anonymous CloudFront delivery.
- **WAF on pay-as-you-go:** $5.00 per web ACL per month, $1.00 per rule per month, $0.60 per 1M requests.

**Cloudflare.**

R2 (https://developers.cloudflare.com/r2/pricing/, updated 2026-10-30):

| | Standard | Infrequent Access |
|---|---|---|
| Storage | $0.015/GB-mo | $0.01/GB-mo |
| Retrieval | none | $0.01/GB |
| Minimum duration | none | 30 days |
| Class A (writes) | $4.50/M | $9.00/M |
| Class B (reads) | $0.36/M | $0.90/M |
| Egress | **Free** | **Free** |

- **R2 terms.**
  - The free tier (Standard only) is 10 GB-month, 1M Class A and 10M Class B. Usage is **rounded up** to the next GB-month or million operations.
  - An "R2 subscription" must be added in the dashboard (https://developers.cloudflare.com/r2/get-started/).
  - Limits: 5 TiB per object, 5 GiB single-part upload (https://developers.cloudflare.com/r2/platform/limits/).
  - `r2.dev` is "not intended for production". It returns 429 at "hundreds of requests/second" and may throttle bandwidth.
- **A custom domain needs the zone in the same Cloudflare account.** A partial (CNAME) setup is Business/Enterprise only (https://developers.cloudflare.com/r2/buckets/public-buckets/ , https://developers.cloudflare.com/dns/zone-setups/partial-setup/). **So R2 means moving the whole DNS zone to Cloudflare.**
- **The CDN** caches files up to **512 MB** on Free/Pro/Business, and does not cache JSON/HTML by default (https://developers.cloudflare.com/cache/concepts/default-cache-behavior/).
- **CDN terms** (https://www.cloudflare.com/service-specific-terms-application-services/, updated 2026-09-28):
  - Unless you are Enterprise, "you must use" paid services "(e.g., the Developer Platform…)" to serve "video and other large files via the CDN".
  - Cloudflare may limit a CDN that serves "a disproportionate percentage of… large files".
  - **R2 is the sanctioned route; B2 behind the free CDN is a grey zone.**
- **Pages and Workers.**
  - Pages: 20,000 files Free or 100,000 paid; **25 MiB per file**; 500 builds/month; `_redirects` up to 2,000 static plus 100 dynamic (https://developers.cloudflare.com/pages/platform/limits/).
  - Workers static assets have the same file limits. Worker *script* invocations are 100,000/day on Free (https://developers.cloudflare.com/workers/platform/limits/).
  - "**Requests to static assets are free and unlimited**", and Workers Paid starts at $5/month (https://developers.cloudflare.com/workers/platform/pricing/).
- **Rate limiting and spend.**
  - Rate limiting on Free is 1 rule, a 10 s window, per IP, counting requests rather than bytes (https://developers.cloudflare.com/waf/rate-limiting-rules/).
  - Spend control is email notifications only. **No hard spend cap was found** (https://developers.cloudflare.com/billing/).
- **Moving DNS** means a full setup: change the NS at Gandi, with DNSSEC off, which it already is (https://developers.cloudflare.com/dns/zone-setups/full-setup/setup/).

**Backblaze B2** (https://www.backblaze.com/cloud-storage/pricing , https://www.backblaze.com/cloud-storage/transaction-pricing).
- **Price.** **$6.95/TB-month**, with the first 10 GB free. Class A/B/C calls are free; Class D costs $0.004/10k after 2,500/day.
- **Egress.** Free up to 3× the average stored, then $0.01/GB. Unlimited free egress "to or through partner CDNs… including Fastly, Cloudflare, bunny.net…" (verified from Backblaze's side only).
- **Caps.** Daily dollar caps are available (https://www.backblaze.com/docs/cloud-storage-data-caps-and-alerts).
- **Inconsistency.** The transaction page still says "$0.005/GB/month"; the model uses $6.95/TB.

**GitHub.**
- **Releases.** Up to 1,000 assets; "Each file… must be under 2 GiB. There is no limit on the total size of a release, nor bandwidth usage" (https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases). However, AUP §9 lets GitHub "throttle your file hosting" (https://docs.github.com/en/site-policy/acceptable-use-policies/github-acceptable-use-policies).
- **LFS.** Free/Pro get 10 GiB storage plus 10 GiB/month bandwidth (https://docs.github.com/en/billing/concepts/product-billing/git-lfs). Overage is $0.07/GiB-month and $0.0875/GiB (https://github.com/pricing/calculator).
- **Pages.**
  - Sites are limited to 1 GB, with a soft 100 GB/month bandwidth limit (https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits).
  - Pages is "not intended for or allowed to be used as a free web hosting service to run your online business…" (https://docs.github.com/en/site-policy/github-terms/github-terms-for-additional-products-and-features).
  - No clause literally says "file host prohibited".
- **Verdict.** Releases are a free secondary mirror for files under 2 GiB; LFS is unsuitable; Pages is fine for HTML.

**Hugging Face** (https://huggingface.co/docs/hub/storage-limits , https://huggingface.co/pricing , https://huggingface.co/docs/hub/rate-limits).
- **Storage.** Free public storage is "Best-effort" with no published number. PRO costs $9/month for "up to 10TB" public.
- **Limits.** 500 GB per file; "Egress and CDN included at no extra cost".
- **Rate limits** apply to the downloader: 3,000 resolver calls per 5 minutes per anonymous IP.
- **Verdict.** A secondary mirror.

**Zenodo.**
- **Quotas.** It is free. "Total files size limit per record is 50GB. Higher quotas can be requested" (https://about.zenodo.org/policies/). Through the API: 50 GB and up to 100 files per record (https://developers.zenodo.org/).
- **Files** are immutable after publishing.
- **Rate limits.** Guests get 60/min and 2,000/hour; authenticated users 100/min and 5,000/hour (https://developers.zenodo.org/#rate-limiting). Real projects hit 429s (https://github.com/catalyst-cooperative/pudl/issues/4856).
- **Hotlinking.** No policy found either way. The principles require "a totally open/anonymous route" (https://about.zenodo.org/principles/).
- **Shared limits [Est].** A class behind one NAT shares 2,000/hour. That is ample for whole files but tight for range-request download managers.
- **Throughput** from Geneva to Taiwan was not measured.

**Taiwan options.**
- **TWCC (國網 Taiwan AI Cloud)** 「於2026年8月31日正式停止服務」 (https://iservice.nchc.org.tw/nchc_service/nchc_service_news_content.php?contentId=1089653&type=all_content&newsId=78314 ; banner at https://man.twcc.ai/@twccdocs/SJWlN3YDr).
- **晶創雲 (IIC)**, its successor, launched in August 2026 with S3 object storage (https://www.nchc.org.tw/Page?itemid=1114&mid=1206). Its prices were **not found**.
- **SciDM**: §6.5 (https://scidm.nchc.org.tw/about).
- **depositar**: ≤ 1 GB per file, 「實驗性質」; asks to be contacted before use as a primary repository (§6.5).
- **TWAREN** connects only 「各公私立大學、教育機關、國家級研究機構、政府機關…非營利性研究機構」 applying as institutions (https://www.twaren.net/Services/). **There is no offering for individuals.**

### 8.2 Formulas (monthly)

Symbols:

| Symbol | Meaning |
|---|---|
| `S_std` | GB in hot storage |
| `S_arch` | GB of raw source snapshots in the archival class |
| `R_arch` | GB read back from the archive |
| `E` | total egress GB (pages + data) |
| `Q` | total HTTPS requests |
| `a` | share of traffic in the Taiwan/Asia pricing group (0.70; the rest at the US rate) |
| `m` | cache-miss ratio to origin (0.10) |
| `P` | PUT count |

```
(a) AWS S3 + CloudFront pay-as-you-go
C_a = Tier_AP(a·(E−1024)+) + Tier_US((1−a)·(E−1024)+)          # CloudFront DTO after 1 TB free
    + (Q−10M)+ · [a·0.012 + (1−a)·0.010]/10k                     # CloudFront HTTPS requests
    + (Q−2M)+ · $0.10/M                                          # CloudFront Function (index.html rewrite)
    + S_std·p_std + S_arch·p_GIR + R_arch·$0.03                  # S3 storage (Seoul p_std=0.025, GIR 0.005)
    + m·Q·$0.0035/10k + P·$0.0045/1k                             # S3 requests
    + $0.50                                                      # Route 53 hosted zone
    [+ $5 + 2×$1 + Q·$0.60/M]                                    # optional WAF (needed for rate limiting)
"Without free tier" removes the 1024 GB, 10M request and 2M function allowances.
The free tier is applied pro rata across regions (AWS does not document the allocation).

(b) AWS flat-rate: pick the smallest plan with E ≤ allowance_GB and Q ≤ allowance_requests
C_b = PlanFee + (S_std − credit)+ · p_std + S_arch·p_GIR + R_arch·$0.03 + S3 request fees
(WAF, Route 53 and CloudFront Functions included)

(c) Cloudflare R2 + Workers static assets (site)
C_c = (S_std−10)+·$0.015 + S_arch·$0.010 + R_arch·$0.01 + (GET_R2−10M)+·$0.36/M + (P−1M)+·$4.50/M [+ $5 Workers Paid]
(egress $0, DNS $0, static-asset requests $0)

(d) Backblaze B2 behind Cloudflare
C_d = (S_std+S_arch−10)+ · $0.00695      (+ $0.01·(E_data − 3·S)+ if served directly)

(e) Zenodo as data host: C_e = site-only cost (a or b with data removed); Zenodo itself $0
```

### 8.3 Scenario assumptions (stated so they can be challenged)

- **Page weight:** 0.5 MB and 15 HTTPS requests per page view. This is a conservative first-visit estimate, and bots and agents count as page views.
- **Copies per dataset:** 4 canonical formats plus 1 raw = 5 copies. Large temporal datasets get 3 formats plus 1 raw.
- **S1 (today):** 10 datasets × ~20 MB × 5 copies ≈ 1 GB (0.8 hot, 0.2 archive); 200 downloads × 20 MB = 4 GB; 5,000 page views (2.5 GB, 75k requests). E = 6.5 GB; Q ≈ 75k.
- **S2:** 150 small (20 MB) plus 50 medium (400 MB) datasets × 5 copies = 115 GB, plus ~30% old versions ≈ **150 GB** (125 hot, 25 archive). 4,000 downloads averaging 125 MB = 500 GB; 50,000 page views (25 GB, 750k requests). E = 525 GB; Q ≈ 754k.
- **S3 baseline:**
  - Storage: 2,500 small plus 450 medium × 5 copies = 1,150 GB; 50 large temporal datasets at 30 GB × 4 copies = 6,000 GB; plus ~10% versions ≈ **8,000 GB** (6,300 hot, 1,700 raw in archive).
  - Downloads: 30,000 small/medium averaging 100 MB (3 TB) plus 100 large averaging 20 GB (2 TB) = 5 TB.
  - Traffic: 300,000 page views (150 GB, 4.5M requests) plus 100k download requests. E = 5,150 GB; Q = 4.6M.
- **S3 stress:** the baseline plus one 20 GB file × 500 downloads = +10,000 GB. E = 15,150 GB.
- **S3 hybrid (recommended):** files > 2 GB live only on Zenodo. Our side stores ~1,330 GB (1,100 hot, 230 archive) and serves E = 3,150 GB.

### 8.4 Results (USD/month, from `cost_model.py`)

| Scenario | (a) AWS PAYG with free tier | (a) PAYG, no free tier | (a) PAYG + WAF | (b) AWS flat-rate | (c) Cloudflare R2 + Workers | (d) B2 behind Cloudflare | (e) Zenodo for data (site only) |
|---|---|---|---|---|---|---|---|
| S1 | **$0.52** (Route 53 $0.50) | $1.33 | $7.57 (WAF $7.05) | **$0.00** (Free plan) | $0.00 | $0.00 | $0.00–0.52 |
| S2 | $4.10 (storage $3.25) | $62.52 (egress $57.49) | $11.55 | $17.35 (Pro) | $2.07 | $0.97 | $0.00–0.54 |
| S3 baseline | $622.62 (**egress $451.80**, storage $166) | $740.19 | $632.38 | $183.81 (Pro; **storage $164.75**) | $112.35 (storage) | $55.53 (storage) | $0.94 PAYG / $15.17 Pro / $0 Cloudflare |
| S3 stress month | **$1,717.62** (egress $1,546.80) | $1,827.90 | $1,727.39 | $183.81 (**+$0**) | $112.35 (+$0) | $55.53 (+$0) | same as baseline |
| S3 hybrid (large files on Zenodo) | $263.19 | $380.76 | $272.95 | **$43.39** (Pro) | $18.85 | $9.17 | n/a |

- **Notes.**
  - Moving storage to Taipei saves about 10% (S3 baseline PAYG: $622.62 → $606.87).
  - In (e) at S3 scale, flat-rate costs $15.17 because 4.5M requests exceed the Free plan's 1M.
  - Gandi registration is excluded; it is identical across options.
- **Where the money goes.**
  - S1: fixed fees (Route 53 $0.50; WAF $7 if added on PAYG).
  - S2 PAYG: storage, because egress is inside the free tier. Without the free tier, egress is 92%.
  - S3 PAYG: egress, 73%.
  - S3 flat-rate, R2 or B2: storage, 90–100%.
- **Break-even, flat-rate Pro vs PAYG:** about **1,145 GB/month** of egress, at a blended first-tier rate of $0.1095/GB: `1024 + (15 − 50 GB credit × $0.025 − $0.50 Route 53) / 0.1095 ≈ 1,145 GB`. If WAF would run anyway, it is about 1.08 TB/month.

Flat-rate Pro vs R2, by stored GB (hot only):

| Stored | AWS Pro | R2 | Delta |
|---|---|---|---|
| 100 GB | $16.25 | $1.35 | $14.90 |
| 1 TB | $38.75 | $14.85 | $23.90 |
| 2 TB | $63.75 | $29.85 | $33.90 |
| 5 TB | $138.75 | $74.85 | $63.90 |
| 8 TB | $213.75 | $119.85 | $93.90 |

### 8.5 Worst-case surprise bill

Egress only, CloudFront pay-as-you-go, no free tier:

| Event | 70/30 traffic mix | All-Taiwan | Direct from the public Seoul bucket ($0.126→$0.108/GB) |
|---|---|---|---|
| 10 TB (the stress case) | $1,095 | $1,200 | $1,247 |
| 50 TB | $4,956 | $5,205 | $6,141 |
| A bot pulling 1 Gbps for 30 days = 324 TB | **$28,548** | $30,389 | **$36,671** |

| Option | Worst case | How it is capped |
|---|---|---|
| (a) PAYG | Unbounded, ~$30k/month at 1 Gbps; the public-bucket bypass is worse | **No native hard cap.** Budgets only alert, 8–12 h late. WAF rate rules count *requests*, not bytes (one 20 GB GET is one request). Real mitigations: a per-file size policy; geo/ASN rules; signed URLs (they break agent-friendly links); a DIY kill switch (Budgets → SNS → Lambda, not costed); and closing the public bucket |
| (b) Flat-rate | **$0, $15 or $200 per month.** Storage beyond the credit, S3 requests, Lambda@Edge and logs to S3 stay PAYG | The plan *is* the cap. The risk becomes throttling, or AWS "requiring a change to your pricing structure". **It only works if the bucket is private behind OAC** |
| (c) R2 | Egress always $0. A cache-missing flood of 1 billion GETs ≈ $356 | Cloudflare cache (files ≤ 512 MB), 1 WAF rate rule on Free, never `r2.dev`, spend emails. No hard cap found |
| (d) B2 + Cloudflare | Storage only; direct hits beyond 3× stored cost $0.01/GB | B2 daily hard caps. The risk is availability under Cloudflare's large-file terms |
| (e) Zenodo | $0 | 429s for users (60/min, 2,000/h per guest IP), outages, 50 GB per record |

### 8.6 Recommendation and flip thresholds [Rec, storage researcher; the hosting resolution is in §14]

1. **Close the bypass first.**
   - Turn on S3 Block Public Access.
   - Switch the origin to the REST endpoint with **OAC**; flat-rate plans do not support OAI.
   - Reproduce index-document behaviour and real 404s in a **CloudFront Function**.
   - Expire noncurrent object versions after 30 days.
2. **One distribution, two origins.**
   - One bucket for the HTML; a second private bucket behind OAC for `/data/<dataset-id>/<version>/<file>`. Version paths are immutable, so a 1-year TTL works with no invalidations.
   - A separate `data.netscied.tw` distribution would cost a second plan, and **whether two plans can share an apex or a Route 53 zone could not be verified**.
   - New buckets can go in ap-east-2 (Taipei: $0.0225 vs $0.025, and data stays in Taiwan) or stay in Seoul.
3. **Plan tier.**
   - Free now (S1, $0).
   - Upgrade to **Pro ($15)** when sustained traffic exceeds ~100 GB or 1M requests/month (S2). Pro covers S3-scale traffic, including the 10 TB stress month.
   - Attach the Route 53 zone (saves $0.50). Keep a free Budget alert for storage creep.
4. **Files > 2 GB are hosted only on Zenodo,** with one record per version (50 GB per record) and published checksums. Everything ≤ 2 GB is on our CDN *and* in Zenodo.
   - Why 2 GB: it is the GitHub Releases/LFS-free ceiling.
   - It keeps S3-scale storage at ~1.3 TB instead of 8 TB ($43 vs $184 on Pro).
   - It bounds a PAYG fallback: 500 downloads of a 2 GB file = 1 TB, inside the free tier.
5. **Raw snapshots** stay private in Glacier IR ($0.005/GB-mo), or in B2 as a second vendor. Zenodo also requires "appropriate rights" and supports restricted files.
6. **Pre-compress** text formats (gzip/zstd).

- **Migration from today.** About half a day of console work and $0 of data movement. The risk is breaking old URLs at the origin switch, so test the function against the route list first.
- **Operational complexity:**
  - flat-rate: low ongoing;
  - PAYG: low setup, but uncapped;
  - Cloudflare: a medium one-off (NS change, wrangler, R2 custom domain, porting redirects);
  - B2 + Cloudflare: three vendors plus a terms grey zone;
  - Zenodo: per-dataset deposit work, which is desirable anyway.

**When to flip to Cloudflare** (R2 for data, Workers static assets for the site, Cloudflare DNS). Any one of these triggers it:
1. **Sustained requests > 10M/month** for more than 2–3 months (e.g. AI agents or an MCP server). AWS would then need Business at $200/month, while Cloudflare static-asset requests are free and R2 reads cost $0.36/M beyond 10M. This is the most likely trigger.
2. **Hot data on our CDN > ~2 TB.** R2 saves ≥ $34/month, rising to ~$64 at 5 TB and ~$94 at 8 TB.
3. **Sustained transfer > 50 TB/month** (AWS Premium is $1,000).
4. **The flat-rate terms change, or the account turns out to be ineligible.** If the alternative is PAYG with egress above ~1.1 TB/month, flip immediately.

**Migration to Cloudflare** takes about 1–2 days, with DNS propagation of up to 48 h.
- Moving data out is under 100 GB at S1/S2, so free.
- At 8 TB it costs ~$995 from Seoul, unless AWS grants the free migration DTO. Non-EU customers have 180 days to complete the move (https://aws.amazon.com/blogs/aws/free-data-transfer-out-to-internet-when-moving-out-of-aws/, updated 2026-10-08).
- **Lock-in grows with stored TB**, so migrate early if the thresholds look likely.

**Not recommended as primary hosts:**
- B2 behind the free CDN (terms);
- GitHub Releases/LFS/Pages (AUP, metering, 1 GB);
- Hugging Face (best-effort storage);
- depositar (1 GB, experimental);
- SciDM (organisation review, no DataCite DOI);
- TWCC (shut down);
- TWAREN (institutions only).

### 8.7 Not verified in the cost research

- Whether two flat-rate plans may share the apex `netscied.tw`, and whether one Route 53 zone can attach to more than one plan.
- Whether this account counts as "using AWS Free Tier".
- How AWS allocates the 1 TB CloudFront free tier across pricing regions (pro-rated in the model).
- Cloudflare: no hard spending cap was found. Bandwidth Alliance status was verified only from Backblaze's side.
- Backblaze: its region list; the stale $0.005/GB page.
- Zenodo: a hotlinking policy; Geneva→Taiwan throughput.
- 晶創雲 object-storage and egress prices. SciDM eligibility for individual-run organisations, and its DOI support.
- Hugging Face free public storage limits.
- **The modelling assumptions are not measured:** page weight, requests per view, dataset size mix, 5 copies per dataset, and the 70/30 traffic split. The live distribution's CloudFront usage report would replace them.

---

## 9. Search on static hosting for Mandarin

The experiments ran on an Apple M4 with Node 26.13.0 (ICU 79.1). Measurements are labelled as such. The search researcher's stance was cost-conscious and sceptical of over-engineering.

### 9.1 Experiments (measured unless marked)

**Segmentation.** Intl.Segmenter, jieba-wasm 2.4 and overlapping bigrams were compared on catalog-like strings:
- **ICU splits key terms.** Intl.Segmenter splits 超圖 → 超|圖, 旅次 → 旅|次 and 複形 → 複|形, so 超圖 also matched 超高壓.
- **Locale tags do nothing.** `zh-Hant`, `zh-TW` and `zh-CN` give identical output, because ICU has one CJ dictionary. Orama's mandarin tokenizer hardcodes `Intl.Segmenter("zh-CN")`.
- **jieba-wasm** is 4.0 MB (2.8 MB gz). It misparses 臺北捷運 as 臺|北捷運, and its HMM merges 演員電影, which hurts recall.
- **Determinism.** Dictionary segmenters can differ between build-time ICU and each browser's ICU; bigrams cannot.
- **CKIP** (https://github.com/ckiplab/ckip-transformers) is the best Traditional segmenter (WS F1 97.60%), but it is GPL-3.0 and PyTorch, so offline only.
- **[Rec] Decision:** CJK bigrams (single characters stay unigrams and prefix-match), plus lowercase Latin words.

**Retrieval on 10 toy datasets and 5 toy courses, 22 queries.** The gold set was self-authored and tuned, so it is overfit; only 金馬 and TWNIC are real.

| Engine / config | MRR@5 | Recall@3 | Forbidden hits |
|---|---|---|---|
| **MiniSearch + T→S char fold + bigrams + aliases + query rules** | **1.000** | **1.000** | **0** |
| MiniSearch + fold + Intl.Segmenter + aliases + rules | 1.000 (noisier) | 1.000 | 0 |
| MiniSearch + fold + bigrams, no aliases or rules | 0.750 | 0.773 | 3 |
| Orama 3.1.18 + mandarin tokenizer | 0.674 | 0.727 | 2 |
| Fuse.js 7.5 | 0.636 | 0.636 | 0 |

- **Most of the gain comes from aliases and 4 query rules.** Without aliases, every English query over Mandarin-only records missed.
- **Aliases must be granular.** MRT under `domain:transport` gave MRR 0.932; a `mode:metro` concept fixed it.
- **FlexSearch 0.8.212's `Charset.CJK`** is single-character unigrams.

**Pagefind 1.6.0.**
- It missed 台北捷運 (the record says 臺北), 台北捷运 and 单纯复形: there is no folding.
- Its **AND semantics** returned zero for natural-language queries (e.g. 有沒有立委連署的網絡資料).
- A folded `meta.fold` field plus a folded query fixes the folding.
- The first query loads ~77 KB (13.3 KB JS + 55.4 KB wasm + chunks). At 5,000 records a query loads ~26 KB chunks plus 35 KB meta and 32 KB filters.

**MiniSearch scale** (synthetic, pessimistic text; M4):

| N | records.json gz | serialized index gz | build | p50 query |
|---|---|---|---|---|
| 40 | 10.0 KB | 24.2 KB | 15 ms | 0.05 ms |
| 500 | 141 KB | 313 KB | 190 ms | 0.42 ms |
| 5,000 | 1.40 MB | 3.04 MB | 2.1 s | 0.34 ms |

[Est] Phones are 4–6× slower, so 500 records needs a Worker and 5,000 is too big for the client. Shipping records and building the index on the client is smaller than shipping a serialized index.

**Bundle sizes (gz).**
- MiniSearch 7.2.0: **5.9 KB**.
- Fuse.js 9.6 KB; FlexSearch 17.2 KB; Orama 21.9 KB.
- opencc-js full `cn→tw`: **549 KB**.
- OpenCC TSCharacters + TWVariantsRev only: **19.7 KB**, or **0.67 KB** when subset to the toy corpus.
- jieba-wasm: 2.8 MB.

### 9.2 Options compared

| | MiniSearch 7.2 + custom tokenizer ([Rec]) | Pagefind 1.6.0 | Orama 3.1.18 | FlexSearch / Fuse.js |
|---|---|---|---|---|
| CJK | bigrams + fold (yours) | ICU4X at index time, `Intl.Segmenter` at query time (https://pagefind.app/docs/multilingual/ , https://github.com/Pagefind/pagefind/releases) | `Intl.Segmenter('zh-CN')` | unigrams / none |
| T/S, 臺/台 | yes | no (workaround) | no | no |
| Semantics | OR + BM25 + coverage rule | **AND** | threshold | — / fuzzy |
| 5,000 records | too big client-side | chunked, ~26 KB per query | too big | too big |
| Same code in Node (CI, server, MCP) | yes | yes (fetch shim) | yes | yes |
| Status | stable | very active (1.6.0 Nov 2026) | last release 2025-12-19; site now sells "Lake"/"Metis" | active / stable |

- **Browser embeddings: no.**
  - Smallest multilingual ONNX sizes (HF API): multilingual-e5-small int8 **118 MB**; granite-embedding-97m-multilingual-r2 (2026-04-20) 98 MB; EmbeddingGemma-300m 175 MB.
  - Speed is fine (135 ms per embed on an Adreno-650, https://localmode.ai/bench), but the 120–200 MB download is not [Est].
- **Later hybrid search:** server-side RRF `Σ 1/(60 + rank)` with a cosine floor, because dense retrieval never returns zero.
- **Server endpoint costs.**
  - Lambda: 1M requests and 400,000 GB-s free, then $0.20/M (https://aws.amazon.com/lambda/pricing/). Use a function URL with OAC and **GET**, because POST through OAC needs `x-amz-content-sha256` (https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-lambda.html). Node 24 cold init is ~122 ms; [Est] ~$0.0003 per 1,000 queries.
  - Workers Free: 100,000 requests/day. bge-m3 on Workers AI costs **$0.012 per M tokens** (https://developers.cloudflare.com/workers-ai/platform/pricing/); Vectorize: https://developers.cloudflare.com/vectorize/platform/pricing/.
  - An LLM query-rewrite costs ≈ $0.06–$1.00 per 1,000 queries. The figure quoted for "Claude Haiku 5.5" came from cached skill data (§15). [Rec] Opt-in only.
- **SaaS: not justified [Rec].** Algolia (https://www.algolia.com/pricing), Meilisearch from $20/month (https://www.meilisearch.com/pricing), Typesense (https://typesense.org/docs/guide/locale.html); Orama Cloud is no longer listed.

### 9.3 Normalization and the concept table [Rec]

**The pipeline is identical at index and query time.** Displayed text is never altered.
1. `NFKC`, then lowercase.
2. *Query only:* strip Bopomofo and tone marks (U+3100–U+312F, U+31A0–U+31BF, ˊˇˋ˙).
3. **T→S character fold** with OpenCC `TSCharacters` + `TWVariantsRev`.
   - T→S is many-to-one and deterministic; S→T is one-to-many and needs the 549 KB tables.
   - It also folds **臺/台 for free**: 臺北捷運 and 台北捷運 both become 台北捷运.
   - Subset the table to the corpus's folded characters (1–5 KB).
4. **Phrase folds** from a hand list: 网络 → 网路, so 網絡 and 網路 match.
5. CJK bigrams; Latin words.
6. *Query only:* a filler list (有沒有, 我想找, 請問, 哪裡, 相關, 的, 資料/資料集/數據/dataset/data/下載) plus **台灣/臺灣/Taiwan**, which carries no information in a Taiwan-only catalog.

**The concept and alias table is the main lever.** Every concept label is attached to records at build time, boosted 1.5–2, and published in the agent JSON:

```yaml
structure:hypergraph:         [超圖, 超網路, 超網絡, 高階網路, hypergraph, higher-order network]
structure:simplicial-complex: [單純複形, 單形複形, 单纯复形, simplicial complex, higher-order]
structure:bipartite:          [二分網路, 二分網絡, 二分圖, 二部圖, 雙模網絡, bipartite, two-mode, affiliation network]
structure:ranking:            [排名, 排序, 排行, 名次, 成對比較, 兩兩比較, ranking, pairwise comparison, tournament, Bradley–Terry, Elo]
mode:metro:                   [捷運, 北捷, 高捷, 桃捷, MRT, metro, subway, 地鐵, 旅次, 運量, 起訖, OD, ridership]
domain:politics/legislature:  [立法院, 立委, 立法委員, 國會, 連署, 共同提案, legislator, legislature, cosponsorship, bill]
domain:internet:              [網際網路, 網路基礎設施, 骨幹, ISP, AS, internet, internet topology, peering]
generic (near-stopwords):     [網路, 網絡, 网络, network, networks, graph, 圖, 資料, data]
```

**Four query rules**, each tested in the gold set:
1. **Coverage.** After removing generic terms, keep a hit only if it matches ≥ 1/3 of the specific query bigrams. A query of only generic words lists everything.
2. **Computer-networking intent.** 計算機網路, 電腦網路, 網路工程, 網路協定, TCP/IP or "computer network" multiply the score of non-`domain:internet` records by 0.2. In data mode, also show a hint toward course mode.
3. **Mode words.** 課程/course in data mode, or 資料/dataset in course mode, show a "switch" hint and never switch silently.
4. **Fuzzy matching** only for Latin words of 6 or more characters (`fuzzy: 0.2`). CJK typos already get partial credit (金馬講 → 金馬獎).

**Ranking and facets.**
- Field boosts: title 4, keywords 2.5, aliases 1.5–2, en 1.5, description 1.
- Facets are computed client-side: OR within a facet, AND across.
- State lives in the URL.
- [Rec] Build-time LLM drafting of English titles and aliases, reviewed and committed as data, costs well under $0.10 for 40 records.

### 9.4 IME findings

- **Mid-composition text is Han, not Latin.** macOS Zhuyin and Cangjie show *Han characters* in the uncommitted text, so searching on `input` events queries wrong text.
- `KeyboardEvent.isComposing` is true between `compositionstart` and `compositionend` (https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/isComposing).
- **WebKit bug 165004.** Safari delivered `compositionend` *before* the confirming Enter. It was marked fixed in April 2026 (https://bugs.webkit.org/show_bug.cgi?id=165004), but old Safari versions remain in the field.
- **Chrome's guidance** (https://developer.chrome.com/docs/modern-web-guidance/guides/forms/ime-safe-enter-submit):
  - Use `event.isComposing || event.keyCode === 229`, or a 50 ms window after `compositionend`.
  - "browsers suppress implicit submission when the Enter keystroke is consumed by an IME".
- **Angular's `DefaultValueAccessor`** buffers until `compositionend`, except on Android (`_compositionMode = !_isAndroid()`, https://github.com/angular/angular/blob/main/packages/forms/src/directives/default_value_accessor.ts).
- [Rec] Use a native `<form>` submit with no custom Enter handler, and `<input type="search" enterkeyhint="search" lang="zh-Hant-TW" autocomplete="off">`. Don't show 「查無結果」 before ~300 ms idle. Add a Playwright test: `compositionstart` → `input`("手田") → `compositionend` → Enter must give exactly one search.
- Android Gboard Zhuyin and old iOS Safari need real-device tests.

### 9.5 Scaling path (adopted in §14)

- **Stage 1** (now to ~300–500 records): fully static, $0.
  - The build attaches aliases, emits the catalog JSON plus a corpus-subset fold map, and **fails on a gold-set regression**.
  - The client lazy-loads MiniSearch, the catalog and the fold map on focus or idle, and builds the index (~15 ms on M4 at 40 records).
  - Payload: about 6 KB library + 1–5 KB fold + 10–35 KB catalog, all gz.
  - Optional zero-result beacon: `GET /_zr?q=…` to a cached empty object, read from CloudFront logs.
- **Stage 2:** when `catalog.json` exceeds 150 KB gz (~300–500 records), or an API is wanted.
  - Serve `GET /api/search` from a Lambda function URL behind CloudFront, reusing **the same search core**.
  - The client keeps a small title index for suggestions.
  - The static-only alternative is Pagefind with folded metadata and a relaxation cascade.
- **Stage 3, only on evidence:** over a month with ≥ 200 logged queries, zero-result or no-click above ~10%, with paraphrase or cross-lingual misses that aliases can't fix.
  - Add server-side query embeddings (bge-m3 or Qwen3-Embedding-0.6B at $0.012/M tokens) fused by RRF (k=60), with a cosine floor.
- **The triggers are corpus size and measured quality, not traffic.**

### 9.6 Gold-set outline (about 27 queries) [Rec]

**Format.** Store it as `search-gold.yaml`. Each item has `q`, `mode`, graded `relevant` (2 ideal, 1 acceptable), `forbidden` (never in the top 5) and `expect_zero`.

| # | Query | Mode | Expected |
|---|---|---|---|
| 1–3 | 捷運 · 台北捷运 · 臺北捷運旅次 | data | Taipei MRT ridership network top 3, then rank 1 |
| 4–6 | MRT ridership · 地铁客流网络 · Taipei 捷運 OD | data | same (English, mainland vocabulary, mixed) |
| 7–9 | 超圖 · hypergraph · 有沒有立委連署的網絡資料 | data | LY co-sponsorship hypergraph rank 1 |
| 10–13 | 二分網絡 · bipartite network · 金馬講 演員 (typo) · 電影演員合作關係 (paraphrase, a known weak spot) | data | Golden Horse network rank 1 or top 3 |
| 14–17 | 排名 · pairwise comparison · 单纯复形 · simplicial complex | data | ranking or simplicial datasets |
| 18–19 | 台灣網路節點頻寬 · 網際網路拓樸 / internet topology | data | TWNIC rank 1 |
| 20 | 計算機網路 | data | **forbidden:** social, film, legislative, transport and collaboration datasets in the top 5; TWNIC acceptable; empty passes |
| 21 | 社群網路 PTT | data | PTT/social-media interaction networks (see §15) |
| 22 | 台灣 網絡 資料 | data | not zero; browse all |
| 23–24 | 社會網絡分析 · 網路科學 課程 | course | SNA course rank 1; network-science courses top 3 |
| 25 | 計算機網路 | course | **forbidden:** a network-science course at rank 1 |
| 26–27 | graph theory · 高階網路 / higher-order networks | course | 圖論 rank 1; higher-order courses |
| UI | ㄐㄧㄝˊ / 手田 then Enter | — | no search mid-composition; exactly one on commit |

**Method.**
- A CI step using the same core reports Recall@5, MRR@10, nDCG@5, forbidden hits and unexpected zeros.
- It **fails** if MRR@10 drops by more than 0.05 from the baseline, or on any forbidden hit or unexpected zero.
- Auto-generated invariance tests assert the same top 1 for:
  - the zh-Hans form (full OpenCC in CI only);
  - the 臺↔台 swap;
  - a full-width variant.
- Hold out ~30% of the queries. Add real zero-result queries monthly.

---

## 10. Agent discoverability

### 10.1 Who reads what (as of 2026-11)

| Surface | Index / fetcher | Source |
|---|---|---|
| Google AI Overviews / AI Mode | Google Search index; a page must be "indexed and eligible to be shown in Google Search with a snippet" | https://developers.google.com/search/docs/fundamentals/ai-optimization-guide ; https://support.google.com/webmasters/answer/16908024 |
| Gemini app grounding | Google index; governed by `Google-Extended` | https://developers.google.com/search/docs/crawling-indexing/google-common-crawlers |
| Microsoft Copilot | Bing; Webmaster Tools "AI Performance" (Feb 2026, expanded June/Oct) | https://blogs.bing.com/webmaster/2026/2/Introducing-AI-Performance-in-Bing-Webmaster-Tools-Public-Preview/ ; https://blogs.bing.com/search/2026/6/New-AI-Visibility-Insights-in-Bing-Webmaster-Tools-Intents-Topics-Citation-Share-Compare/ |
| ChatGPT search | OAI-SearchBot: "Sites that are opted out of OAI-SearchBot will not be shown in ChatGPT search answers" | https://developers.openai.com/api/docs/bots |
| Claude web search | [Rep] Brave Search per Anthropic's subprocessor list, plus Claude-SearchBot | https://depra.ai/blog/which-search-index-does-each-ai-engine-use ; https://support.claude.com/en/articles/8896518 |
| Perplexity | its own index (PerplexityBot) | https://docs.perplexity.ai/guides/bots |
| Codex CLI | web search in **cached mode** from an OpenAI index; shell network off by default | https://learn.chatgpt.com/docs/agent-approvals-security |

Taiwan search share in October 2026 was Google 80.0%, Yahoo 10.9% and Bing 8.1% (https://gs.statcounter.com/search-engine-market-share/all/taiwan). That Yahoo results come from Bing is widely reported [Rep]. The conclusion: proper indexing by Google, Bing and Brave, and being fetchable by every vendor's bots, covers essentially every AI surface.

### 10.2 Evidence per mechanism

- **llms.txt.**
  - Google: "You don't need to create new machine readable files, AI text files, markup, or Markdown to appear in Google Search" (AI optimization guide; https://developers.google.com/search/updates). Lighthouse treats it as optional (https://developer.chrome.com/docs/lighthouse/agentic-browsing/llms-txt).
  - Ahrefs (137K domains): 97% of published files got zero requests in May 2026, and **Claude-Code was the second-largest named fetcher** (https://ahrefs.com/blog/llmstxt-study/).
  - EZY: OpenAI fetched robots.txt 3,990 times and llms.txt 7 times (https://www.ezy.ai/research/do-ai-bots-read-llms-txt).
  - [Rec] **DO**, as a byproduct.
- **Markdown siblings.**
  - Claude Code WebFetch sends a `Claude-User` UA and prefers Markdown. It reads **100,000 characters**, converts with Turndown, and extracts with a small model, "lossy by design" (https://code.claude.com/docs/en/tools-reference#webfetch-tool-behavior).
  - Cursor and OpenCode prefer Markdown; Codex, Gemini CLI, Copilot and Windsurf don't (https://www.checklyhq.com/blog/state-of-ai-agent-content-negotation/).
  - Inline CSS has filled the whole window (https://dacharycarey.com/2026/02/19/agent-web-fetch-spelunking/), so keep Angular's critical CSS and `ng-state` small.
  - Cloudflare "Markdown for Agents" is Pro+ and Cloudflare-proxied only (https://developers.cloudflare.com/fundamentals/reference/markdown-for-agents/).
  - [Rec] **DO** `index.md` siblings with *visible* links. `Accept: text/markdown` negotiation via a CloudFront Function is MAYBE.
- **JSON-LD.**
  - Dataset markup is "only used by Dataset Search" (2025-11-05). Dataset Search recovered from a 2026-10-15 outage (https://seroundtable.com/google-dataset-search-broken-42315.html).
  - Course info and SearchAction no longer produce results.
  - Assistants fetching live pages **did not return facts present only in JSON-LD** (https://www.searchviu.com/en/schema-markup-and-ai-in-2025-what-chatgpt-claude-perplexity-gemini-really-see/ ; https://botpresso.com/ai-assistants-schema-markup-test/). [Rep] Bing says schema helps Copilot (https://searchengineland.com/microsoft-bing-copilot-use-schema-for-its-llms-453455).
  - [Rec] DO Dataset, DataCatalog, BreadcrumbList and Organization; MAYBE Course; SKIP SearchAction. Keep every fact visible.
- **Sitemap.** Google ignores priority and changefreq, and uses an accurate `<lastmod>` (https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap).
- **JavaScript.**
  - "none of the major AI crawlers currently render JavaScript"; only Googlebot and Applebot do (https://vercel.com/blog/the-rise-of-the-ai-crawler; unrefuted as of 2026-09, https://doesitcrawl.com/).
  - The Anthropic API web_fetch does not run JS (https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-fetch-tool).
  - So every record needs a prerendered page and static JSON, the tables must be fully in the HTML, and search URLs get `noindex`.
- **Static JSON API: DO**, as the best agent ergonomics and the future MCP source. Proposed layout:
  - `/api/v1/index.json`, `datasets.json`/`.csv`, `datasets/<id>.json`, `courses.json`, `courses/<id>.json`, `taxonomy.json`, `search-index.json`, `schema/*.schema.json`;
  - `Access-Control-Allow-Origin: *`; ids never change.
  - The reports' layouts differ (§15).
- **Manifests.**
  - OpenAPI 3.1: MAYBE.
  - RFC 9727 api-catalog (https://www.rfc-editor.org/rfc/rfc9727.html): SKIP; no AI client support (https://labs.sitebulb.com/docs/checks/protocol-discovery/api-catalog/).
  - MCP Server Card (SEP-2127, Final since 2026-10-06, https://modelcontextprotocol.io/seps/2127-mcp-server-cards): with MCP.
  - SKIP: NLWeb, agents.json, ai-plugin.json, A2A, and WebMCP (an origin trial to 2027-03-30, https://developer.chrome.com/docs/ai/webmcp).
- **Agents fetching.**
  - Claude Code MCP output is capped at 25,000 tokens (https://code.claude.com/docs/en/mcp).
  - Codex live fetch needs `--search`, and its shell has no network by default.
  - [Rec] Give direct download URLs, size, sha256, an SPDX licence and a citation.
- **Being cited.** Branded mentions correlate 0.66–0.71 with AI visibility, against 0.22–0.32 for backlinks (https://ahrefs.com/blog/ai-brand-visibility-correlations/). [Rec] Use zh-first factual prose with 網路/網絡, 臺/台, 資料集/數據集 and the structure terms.
- **Webmaster tools.**
  - **DO** Google Search Console (Gen-AI report worldwide since 2026-08-31, https://developers.google.com/search/blog/2026/06/gen-ai-performance-reports) and Bing Webmaster Tools, verified by Route 53 TXT.
  - MAYBE IndexNow (no Google; https://www.indexnow.org/searchengines.json) and Brave Submit URL.

### 10.3 Crawlers (as of 2026-11; T = training, S = search/answer index, U = user-triggered)

| UA token | Class | robots.txt | Source |
|---|---|---|---|
| GPTBot | T | yes | https://developers.openai.com/api/docs/bots |
| OAI-SearchBot | S | yes; blocking removes the site from ChatGPT search | same |
| ChatGPT-User | U | "robots.txt rules may not apply" | same |
| ClaudeBot / Claude-SearchBot / Claude-User | T / S / U | yes (Crawl-delay honoured) | https://support.claude.com/en/articles/8896518 |
| PerplexityBot / Perplexity-User | S / U | yes / "generally ignores robots.txt" | https://docs.perplexity.ai/guides/bots |
| Googlebot / Google-Extended | S / token for Gemini training **and Gemini-app grounding** | yes | https://developers.google.com/search/docs/crawling-indexing/google-common-crawlers |
| Google user fetchers | U | "generally ignore robots.txt" | https://developers.google.com/search/docs/crawling-indexing/google-user-triggered-fetchers |
| Bingbot | S | yes | — |
| Applebot / Applebot-Extended | S (**renders JS**) / T token | yes | https://support.apple.com/en-us/119829 |
| CCBot | T | yes | https://commoncrawl.org/ccbot |
| Meta-ExternalAgent / Meta-WebIndexer / Meta-ExternalFetcher | T / S / U ("may bypass") | yes / yes / — | https://developers.facebook.com/docs/sharing/webmasters/web-crawlers/ |
| Amazonbot / Amzn-SearchBot | product, may train / S | yes | https://developer.amazon.com/amazonbot |
| Bytespider | T [Rep] | poorly: ignored robots.txt on 48% of scrapes (TollBit H1-2026); needs its own group | https://hybridranking.com/blog/what-is-bytespider ; https://github.com/ai-robots-txt/ai.robots.txt/issues/108 |
| DuckAssistBot | U/S, not training | yes | https://duckduckgo.com/duckduckgo-help-pages/results/duckassistbot |
| `__usage_ai-training` | IETF draft policy token. Google "aim[s] to support" it in 2027; OpenAI "in the coming months"; Anthropic began recognising a no-training signal on 2026-10-30 | — | https://developers.google.com/search/blog/2026/10/ai-training-control ; https://datatracker.ietf.org/doc/draft-kelley-aipref-training-preference-signal/ |

- Fewer than 40% of AI bots re-check robots.txt within 168 h (https://arxiv.org/html/2505.21733).
- **[Rec] Option A, allow everything.** `User-agent: *`, `Allow: /`, `Disallow: /search?` and `Sitemap:`. For a public-good catalog, inclusion in training data is a benefit.
- **Option B: opt out of training only.** Disallow GPTBot, ClaudeBot, Applebot-Extended, CCBot, Meta-ExternalAgent, Bytespider (own group) and `__usage_ai-training`.
  - **Do not block** the search and user bots.
  - **Do not block Google-Extended**: that also removes Gemini-app grounding.
  - Under the token plan, add an explicit `Google-Extended` Allow group.
- The training stance is the owner's call.

### 10.4 Ranked list [Rec]

| Rank | Item | Verdict |
|---|---|---|
| 1 | Real HTTP semantics: real 404s, real robots.txt and sitemap.xml, no soft 404 at `/.well-known/*` | **DO (blocking)** |
| 2 | A prerendered page per dataset and course; full tables in HTML; search results noindex | **DO** |
| 3 | Static JSON API with stable IDs, CSV, licences, direct downloads, citation | **DO** |
| 4 | robots.txt allowing all search and user bots; sitemap with truthful lastmod | **DO** |
| 5 | Google Search Console and Bing Webmaster Tools | **DO** |
| 6 | schema.org Dataset/DataCatalog/BreadcrumbList/Organization | **DO** |
| 7 | `.md` versions of record pages with visible links | **DO** |
| 8 | llms.txt (plus a small llms-full.txt) | **DO (cheap byproduct)** |
| 9 | IndexNow ping on deploy; Brave Submit URL | MAYBE (cheap) |
| 10 | `Accept: text/markdown` negotiation | MAYBE |
| 11 | OpenAPI 3.1 | MAYBE |
| 12 | Course/ItemList JSON-LD | MAYBE |
| 13 | RFC 9727 api-catalog; MCP server card / ai-catalog | SKIP now (MAYBE with MCP) |
| 14 | SearchAction, NLWeb, agents.json, ai-plugin.json, A2A card, WebMCP | SKIP |

The UX researcher would keep a WebSite `SearchAction` as "harmless", but no surface consumes it. The two agree it brings no SERP feature.

---

## 11. MCP

### 11.1 Spec status and clients (verified 2026-11-04)

- **Current version `2026-07-28`** (https://modelcontextprotocol.io/specification/versioning ; changelog https://modelcontextprotocol.io/specification/2026-07-28/changelog).
  - A **stateless core**: no `initialize` or session id; mandatory `server/discover`; required `Mcp-Method`/`Mcp-Name` headers; `subscriptions/listen`.
  - HTTP+SSE, Sampling, Roots and Logging are deprecated.
  - Streamable HTTP is a single POST endpoint that fits serverless (https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http).
- **A new server must be dual-era.** Legacy clients persist; the TS SDK v2 `createMcpHandler` serves both (https://ts.sdk.modelcontextprotocol.io/v2/migration/support-2026-07-28.html). About one in eight clients used the new path three weeks after release (https://blog.apify.com/mcp-stateless-migration/).
- **Auth for public data** is a SHOULD. Claude's directory accepts "no authentication for public data" (https://claude.com/docs/connectors/building/submission).
- **Annotations are required by both directories.**
  - Anthropic: `title` plus `readOnlyHint` or `destructiveHint`, and names ≤ 64 characters (https://claude.com/docs/connectors/building/review-criteria ; https://support.claude.com/en/articles/13145358-anthropic-software-directory-policy).
  - OpenAI: explicit `readOnlyHint`/`destructiveHint`/`openWorldHint` (https://developers.openai.com/apps-sdk/app-submission-guidelines), plus `structuredContent` and the same JSON as text.
- **Clients.**
  - claude.ai: custom connector on all plans (Free: 1) (https://support.claude.com/en/articles/11175166).
  - Claude Code: `claude mcp add --transport http netscied https://…/mcp`.
  - ChatGPT: "Add custom MCP server", web only. Plan gating is conflicting [Rep]. **Deep research needs read-only `search` and `fetch`** (https://developers.openai.com/api/docs/mcp).
  - Gemini CLI: https://geminicli.com/docs/tools/mcp-server/. Cursor: https://cursor.com/docs/context/mcp. VS Code: https://code.visualstudio.com/docs/copilot/customization/mcp-servers. Codex: `config.toml`.

### 11.2 Hosting options

| Option | Cost | Facts | Abuse exposure |
|---|---|---|---|
| **Cloudflare Workers Free + `createMcpHandler`** ([Rec]) | $0. **100,000 req/day hard cap** (Error 1027), 10 ms CPU, 128 MB (https://developers.cloudflare.com/workers/platform/limits/). Paid $5/month for 10M | Agents SDK v0.20.0 (2026-07-27) serves both eras on one route (https://developers.cloudflare.com/changelog/post/2026-07-27-agents-sdk-v0.20.0-mcp-sdk-v2/). A Custom Domain needs a Cloudflare zone (https://developers.cloudflare.com/workers/configuration/routing/custom-domains/), so use `*.workers.dev` behind CloudFront | **Best**: the cap bounds cost (a daily outage at worst) |
| AWS Lambda behind CloudFront | 1M requests/month and 400,000 GB-s always free (https://aws.amazon.com/free/serverless/) | **OAC on function URLs requires `x-amz-content-sha256` on POST, which MCP clients won't send.** Use `AuthType NONE` with a secret header, or Lambda Web Functions, whose OAC signs POST as `UNSIGNED-PAYLOAD` (https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-lambda-web.html ; https://docs.aws.amazon.com/lambda/latest/dg/web-functions.html) | No hard cap |
| Vercel Hobby / Deno Deploy Free | $0 within limits (https://vercel.com/docs/plans/hobby ; https://deno.com/deploy/pricing) | Hobby is "non-commercial, personal use only" | pauses or soft limits |
| stdio package (npm/PyPI) | $0 | The registry supports `packages` and `remotes` (https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/remote-servers.mdx) | Coding agents and desktop only, not claude.ai web or ChatGPT |

[Rec] Expose the server at `https://netscied.tw/mcp` through a CloudFront behavior `/mcp*` → the workers.dev origin, with CachingDisabled, AllViewerExceptHostHeader and POST allowed. The backend can then change without changing the registered URL. This setup is untested.

### 11.3 Tool surface (five read-only tools) [Rec]

- **Annotations** on every tool: `{"readOnlyHint": true, "destructiveHint": false, "idempotentHint": true, "openWorldHint": false}` plus a title.
- **Responses** return `structuredContent` plus text, with default `limit` 10, under 10k tokens, and `cursor` pagination.
- **Descriptions** lead with zh-Hant. Ids are `dataset:<slug>` and `course:<slug>`.

1. `search {query}` → `{results:[{id,title,url}]}`, for ChatGPT deep research.
2. `fetch {id}` → `{id,title,text,url,metadata}`. The Markdown record goes in `text`, the full record (downloads, licence, citation) in `metadata`.
3. `search_datasets {query?, topic?, kind?, directed?, weighted?, has_download?, taiwan_relation?, limit≤50, cursor?}`.
4. `search_courses {query?, university?, academic_year?, language?, level?, …}`.
5. `list_facets {kind: datasets|courses}`.

The full record should be byte-identical to `/api/v1/datasets/<id>.json`, so the server is a thin view over the static API.

### 11.4 Registry and DNS verification for `tw.netscied`

- **Status.** "The MCP Registry is currently in **preview**. Breaking changes or data resets may occur." API **v0.1 has been frozen since 2025-10-24** (https://github.com/modelcontextprotocol/registry).
  - Live: `GET https://registry.modelcontextprotocol.io/v0.1/version` → `{"version":"1.8.7","build_time":"2026-10-30T11:31:18Z"}`, schema `2025-12-11`.
  - About 53.5K entries (Apideck, 2026-10-31, https://www.apideck.com/blog/mcp-server-directories). No GA.
- **Namespace.** Domain auth gives `tw.netscied/*` (subdomain forms allowed).
  - `.tw` namespaces are live: `tw.org.legaltech/taiwan-law`, `tw.adai/adai`, `tw.cityatlas/cityatlas`, `tw.com.drugnews/mcp`.
  - The registry does not check that the remote URL is on your domain, and each remote URL belongs to one server name.
- **Use DNS, not HTTP.** HTTP verification fails on any 3xx, an HTML 200, WAF challenges or an unreachable AAAA; DNS also covers subdomains.

```bash
brew install mcp-publisher openssl@3
OSSL=/opt/homebrew/opt/openssl@3/bin/openssl     # system LibreSSL lacks Ed25519
$OSSL genpkey -algorithm Ed25519 -out key.pem    # store key.pem in a password manager; never commit it
PUBLIC_KEY="$($OSSL pkey -in key.pem -pubout -outform DER | tail -c 32 | base64)"
echo "v=MCPv1; k=ed25519; p=${PUBLIC_KEY}"
# Route 53 → netscied.tw → edit the EXISTING apex TXT record set → add this as a 3rd value
#   (keep the SPF and protonmail values)
dig TXT netscied.tw +short                       # confirm the MCPv1 value is visible
PRIVATE_KEY="$($OSSL pkey -in key.pem -noout -text | grep -A3 'priv:' | tail -n +2 | tr -d ' :\n')"
mcp-publisher login dns --domain netscied.tw --private-key "${PRIVATE_KEY}"
mcp-publisher init        # then edit server.json
mcp-publisher validate
mcp-publisher publish
curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=tw.netscied"
```

```json
{
  "$schema": "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
  "name": "tw.netscied/taiwan-network-data",
  "title": "台灣網絡科學教育 Taiwan Network Data",
  "description": "Search Taiwan network datasets and network-science courses (zh-Hant/en). Read-only.",
  "version": "0.1.0",
  "websiteUrl": "https://netscied.tw/",
  "repository": { "url": "https://github.com/<owner>/<repo>", "source": "github" },
  "remotes": [ { "type": "streamable-http", "url": "https://netscied.tw/mcp" } ]
}
```

- The description is limited to 100 characters. Bump `version` on each publish.
- Retiring a server only marks it deleted.
- On key rotation, remove the old TXT value, because a stale key is tried first.
- **Do not publish the TXT proof until a server is published.**

### 11.5 Directories, effort, phasing

- **Directories** (volatile).
  - Glama, mcp.directory, PulseMCP (paused since 2026-09-03) and the GitHub MCP Registry ingest from the registry [Rep] (https://manycp.com/guides/directories-that-copy-the-mcp-registry ; https://submitmcp.com/).
  - The Claude Connectors Directory and the ChatGPT app directory need their own submissions, with privacy policies.
  - Smithery's status is unclear [Rep].
  - [Rec] The official registry plus the Claude directory only.
- **Effort [Est]:** Worker and tools 1–1.5 days; tests 0.5–1 day; CloudFront behavior and docs 0.5 day; registry and submission 0.5–1 day. **About 3–4 days, then 1–2 h/month.** The wire format changed in 2025-06-18, 2025-11-25 and 2026-07-28.
- **Phasing (adopted, §14).** MCP is a separate later change (`add-mcp-server`), at about 15–20 datasets or on demand.
  - Reasons: the redesign already reaches every engine and coding agent; MCP is the first runtime service; a near-empty listing may fail review; the registry is a preview.
  - This change reserves `/mcp` and makes `/api/v1` the source.

---

## 12. Network courses offered in Taiwan

As of 2026-11-04, the current term is **115-1**. Confidence codes: **V** = the page was opened, or the record came from an official feed; **E** = crawler text not re-opened; **S** = search snippet only.

### 12.1 Data sources

**No live national course database exists.**

| Source | What it is | Freshness and access |
|---|---|---|
| 教育部 大學校院課程資源網 (https://course-tvc.yuntech.edu.tw/WebU/index.aspx ; search https://course-tvc.yuntech.edu.tw/web_nu/search_course.aspx) | 76 schools, 學年度 86–115, ~7.39M course records, including 課程大綱 full text; exports to Excel/CSV/ODS | It describes itself as 「本網登錄資料為『歷史資料』，非即時性的、非當學期的開課資料」 (https://uma.yuntech.edu.tw/news9-3518.html). ASP.NET postback, Big5, no API, ~25 s per query; 模糊 matching is subsequence-based (圖論 matches 「3D繪圖導論」). The old host `ucourse-tvc.yuntech.edu.tw` is dead |
| data.gov.tw 45717 大學校院課程清單 (https://data.gov.tw/dataset/45717) | Includes 開課老師 | **Frozen at 108**. 31630 (vocational) and 18742 (EMI) are frozen at 107/108 |
| **ISAC 課程表 CSV** `https://opendata.cc-isac.org/public/{106…114}/schedule_{yyy}.csv` (via https://data.gov.tw/dataset/130211) | One CSV per year; **no instructor, no syllabus URL** | The 113 file has 313,084 rows from 73 schools and **lacks NTHU, NYCU, NTNU and NCHU**. The 114 file has 21 schools, semester 1 only (Last-Modified 2026-07-12). OGDL. The host's robots.txt is `Disallow: /`, so fetch only the linked files. It is the best free discovery feed |
| 大專校院校務資訊公開平臺 table 校14 (https://data.gov.tw/dataset/26216) | Registry of each school's 課程資訊公開網址 | Annual; has errors |
| g0v CourseAPI (https://g0v.hackmd.io/@chewei/CourseAPI/) | Volunteer aggregation | Dormant; courseapi.org returns 522. A cautionary example |

**Per university:**

| Univ | Machine-readable access | Links and keys | Barriers |
|---|---|---|---|
| NTU | XLS per college, **current semester only** (http://ftp.ntu.edu.tw/NTU/course/course.htm; BIFF2, Big5) | `https://course.ntu.edu.tw/courses/{114-1}/{流水號}`; legacy NOL still 200. Keys 課號 / 課程識別碼 (https://nol2.aca.ntu.edu.tw/nol/guest/課程編碼說明.pdf) | `/api/` robots-disallowed; **possible hair-trigger auto-ban** ("You got banned permanently from this server.") |
| NCKU | Open data abandoned in 2019 | `…/syllabus/online_display.php?syear=0113&sem=1&co_no=…`; the 2018 link still 200. Key `co_no` | 「…非本校人員若欲使用本資訊，請洽本校取得授權。」 |
| NTHU | **Official JSON**, current semester: https://www.ccxp.nthu.edu.tw/ccxp/INQUIRE/JH/OPENDATA/open_course_data.json (115-1: 3,043 records). Archives at https://curricul.site.nthu.edu.tw/p/404-1208-111356.php | **Syllabi cannot be deep-linked**. Key: 科號 dept+number | robots `Disallow: /`; CAPTCHA |
| NYCU | Undocumented JSON POST `?r=main/get_cos_list` (~8 s per request) | Mirror `https://coz.aa.nycu.edu.tw/course/{學年}/{學期}/{當期課號}` (sitemaps). **NCTU-era pages return 500**. Key 永久課號, which can change | Rate limits [Rep] |
| NCCU | **XLSX** https://newdoc.nccu.edu.tw/teaschm/CoursesList.xlsx (daily) + keyword JSON on `es.nccu.edu.tw` | Static syllabi; 108-1 still 200. Key: 6-digit 科目代號 | none |
| NTNU | JSON `CofopdlCtrl` | Key `course_code` | `NOINDEX`; 臺大系統 duplicates |
| NCU | none | `cis.ncu.edu.tw/Course/…`; the old host returns **404** | **robots `Disallow: /`**; link only |
| NSYSU | Third-party JSON built by ML CAPTCHA-solving (https://nsysu-opendev.github.io/NSYSUCourseAPI/version.json) | Key `CrsDat` (one course can have 3 codes) | **CAPTCHA** |
| NCHU | Excel option (untested) | `Syllabus_main?…`; 101-2 still 200 | none |
| TIGP | Courses registered at partners (https://tigpsnhcc.iis.sinica.edu.tw/course.html) | partner codes | — |

**Takeaways.**
- Official bulk files beat crawling.
- **Link rot comes from system migrations, not old semesters**, so store facts plus `verified_on`.
- Cross-listings duplicate courses; deduplicate on (title, instructor, term).
- **No full network-science OCW or MOOC exists.** Link the few relevant items as `offering_type: ocw`:
  - TOCEC 社會網絡分析 (https://www.tocec.org.tw/web/class_sample.jsp?cm_no=202300000011, CC BY-NC-SA);
  - NYCU 組合學導論;
  - NTHU Pajek and 離散數學 (https://ocw.nthu.edu.tw/chapter/288/6256);
  - TESD SNA videos.
- NTU OCW's robots.txt says `ai-train=no` and blocks ClaudeBot, GPTBot, CCBot and Google-Extended. Never mirror OCW.

### 12.2 Conventions: 學年度, 學期, 學分

- **Academic year.** 《各級學校學生學年學期假期辦法》 (https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=H0020018):
  - §2: 「各級學校以每年八月一日為學年之始，翌年七月三十一日為學年之終。」
  - §3: 「一學年分為二學期，分別以八月一日至翌年一月三十一日、二月一日至七月三十一日各為一學期。」
  - **學年度 N = 1 Aug (N+1911) to 31 Jul (N+1912).**
- **Example: NTU 114-1.** Classes ran 1 Sep–12 Dec 2025, and the term ended 31 Jan 2026. 114-2 classes run 23 Feb–5 Jun 2026 (https://www.education.ntu.edu.tw/Uploads/Files/4c82a8ea-23b9-41e4-a6f1-05c064aa2dcb/114學年度行事曆.pdf). Many schools now teach 16 weeks [Rep]. The next harvest is 115-2, listed around December–January.
- **Notation seen.** `114-1`, `1141`, `114上`, `syear=0114&sem=1` and NTHU's `11510`/`11520`. Summer: NYCU `Sem=X`, NSYSU `1123`, ISAC 學期別 1–4.
  - [Rec] Store a canonical `term: "114-1"` (or `114-S`), ISO dates and the label 「114-1（2025 秋）」.
- **Credits [Rep].** 「原則以授課滿十八小時為一學分」 (大學法施行細則 §23, https://edu.law.moe.gov.tw/LawContent.aspx?id=FL008640). Required-ness is per programme, so it stays optional text.
- **跨校選課** alliances mean a course may be open to partner schools.
  - 臺大系統: 72,614 cross-enrolments over 105–114 (https://www.1111.com.tw/news/167441/amp/).
  - 臺灣國立大學系統: 11 schools (https://research.nchu.edu.tw/upfile/web/18.1臺灣國立大學系統11校簽訂跨校選課合作協議%20大學部2門課程免費.pdf).
  - 臺灣綜合大學系統: https://regs.nsysu.edu.tw/rule/file/202401101624360053.pdf.

### 12.3 Inclusion rules and the 網路 ambiguity

**Measured precision of naive title keyword search:**

| Keyword | Result |
|---|---|
| 網路 | NYCU 111-1→115-1: 338 offerings, 97 distinct titles, **6 relevant titles (≈ 6%)**. NTHU 115-1: 13 hits, 4 relevant (≈ 31%). ISAC 113: 947 titles, **≈ 8 relevant (< 1%)**: 418 computer networking, 108 internet as a medium, 45 神經網路, 368 other (often 網路 as a delivery mode) |
| 網絡 | NYCU: 10 offerings, 6 relevant (**≈ 60%**). ISAC 113: 26 titles, ~17 relevant |
| 圖論 / 圖形理論 / 圖神經 | NYCU: **100%** |
| 社群 alone | NYCU: ≈ 0% |
| Whole semester | **5 of 3,043 NTHU 115-1 courses (0.16%)** are relevant |
| By hand | NTNU 115-1 `chn=網路`: 21 results, 0 relevant. NCCU 115-1 "Network": 12 results, 1 relevant |

**False friends.**
- **Computer networking:** NYCU 計算機網路 (22 offerings), 網路安全, and the whole 網路工程研究所; NTHU 網路之隨機程序, taught by the same instructor as a 社群網路 course.
- **Other technical senses:** 電力網路; 神經網路; 張量網路; 量子網路.
- **The internet as a subject:** 網路行銷, 網路法, 網路學習 (e-learning).
- **Other meanings of the words:** 行動者網絡理論 (ANT); 網絡 as "internet" in HK usage; 圖形識別 (圖 = image); English "graph" inside photography or calligraphy; **網絡統合分析** (network meta-analysis).

**Inclusion rule [Rec].** Include a course when its syllabus or official description shows networks or graphs as the *primary object* (`core`) or a *substantial unit* of at least about 3 weeks (`partial`), in one of four senses:
1. network science;
2. social network analysis;
3. graph theory;
4. graph ML/GNN.

Exclude networking, the internet as a medium, circuits, neural networks, tensor networks and ANT. Keep excluded courses in `rejected.csv` with a reason.

**Discovery scoring heuristics.** The script scores; it never decides alone.
- **Strong positives:** 網路科學, 網絡科學, 複雜網路/網絡, 社會網絡/網路, 社群網路分析, 網絡分析 (not 網路流量分析), 生物網路, 網路生物學, 圖論, 圖形理論 (math or CS departments), 圖神經網路, 圖機器學習, 圖探勘, 圖表示學習, plus the English equivalents.
- **Negative co-tokens *lower* the score but never delete a hit:** 計算機, 電腦, 通訊, 電信, 無線, 協定, 路由, 資安, 程式設計, 雲端, 物聯, 5G, SDN, 行銷, 法, 治理, 學習, 神經, 張量, 量子, 電力, 行動者. A hard veto would drop NYCU 網路策略 and 犯罪網絡, which are real SNA courses.
- **Method terms** recover courses with uninformative titles (three or more terms make a candidate): 中心性, 社群偵測, 小世界, 無尺度, 隨機圖, 結構洞, ERGM, PageRank, UCINET, Gephi, NetworkX, igraph.
- **Hygiene:**
  - Restrict web discovery to `.edu.tw` and Traditional script.
  - "THU" is 東海, not 清華; LLM summarisers mislabelled it during this research.

**Consequences for site search [Rec].**
- **Index only curated course records**, so 網路 in course mode only finds network courses.
- Still fold 網路↔網絡 and 社群↔社會 at query time.
- **The dataset index must not copy the course exclusion rule.** TWNIC really is a computer network, and it is a legitimate network dataset.
- Publish a note: 「本站的『網路／網絡』指網絡科學（network science），非電腦網路課程」.

### 12.4 Seed list (37 rows, ~42 courses; 27 rows offered in 113-1 or later)

Categories: NS = network science, SNA = social network analysis, GT = graph theory, GML = graph ML.

| # | Univ · unit | Title (code) | Instructor | Seen | Cat. | Evidence | Conf |
|---|---|---|---|---|---|---|---|
| 1 | NTHU 通訊所 | 網路科學 (11510COM 530500) | 張正尚 | 115-1 | NS | https://www.ccxp.nthu.edu.tw/ccxp/INQUIRE/JH/OPENDATA/open_course_data.json | V |
| 2 | NYCU 資管所 | 網路科學與社會計算 (MGIM30032) | 李永銘 | every fall 112-1→115-1 | NS/SNA | https://coz.aa.nycu.edu.tw/course/115/1/537605 | V |
| 3 | NYCU 資工 | 網路科學與架構 (CSCS20039), EMI | 樓洋 | 112-1 | NS | https://coz.aa.nycu.edu.tw/course/112/1/515622 | V |
| 4 | TIGP SNHCC (NTHU, NCCU, NTU) | 社群網路(導論) / Social Networks (11510SNHC745000; 761014; Data5012) | rotating (鄧雅文 NCCU 115-1; 楊得年 NTU 113-1; 蔡銘峰 NCCU 112-1; 郭桐惟/沈之涯 fall 2025; 陳宜欣 fall 2026) | every fall 110-1→115-1 | SNA/NS | https://tigpsnhcc.iis.sinica.edu.tw/course.html | V |
| 5 | NTU 經濟所 | 社會網絡的經濟學分析 (ECON7217), EMI | 謝志昇 | 114-2 (also 113-2) | NS | https://course.ntu.edu.tw/courses/114-2/49615 | V |
| 6 | NTU 新聞所 | 社群媒體與社會網絡分析 (JOUR7094), EMI | 劉好迪 Adrian Rauchfleisch | 114-2 | SNA | https://course.ntu.edu.tw/courses/114-2/28289 | V |
| 7 | NTU 圖資 | 社會網絡分析與視覺化 (LIS5102) | 唐牧群 | 110-1 … 114-1 | SNA | https://coursemap.aca.ntu.edu.tw/course_map_all/course.php?code=126+U1650 | E |
| 8 | NTU 地理 | 空間與社會網絡數據分析 (Geog5146) | 溫在弘 | 113-2 | SNA | http://coursemap.aca.ntu.edu.tw/course_map_all/course.php?code=228+U3590 | E |
| 9 | NTU 政治 | 社會網絡與群體行為 (PS5705) | 李宣緯 | 109-2, 111-2 | SNA | https://coursemap.aca.ntu.edu.tw/course_map_all/course.php?code=322+U2410 | E |
| 10 | NTU 數學 | 圖論一 (MATH7703) | 戴尚年 (earlier 張鎮華) | 110-1, 112-1 | GT | https://coursemap.aca.ntu.edu.tw/course_map_all/course.php?code=221+U3450 | E |
| 11 | NTU 資工 | 圖形演算法特論 | 趙坤茂 | 107-2 … 115-1 | GT | https://www.csie.ntu.edu.tw/~kmchao/course.html | V |
| 12 | NTU 資工/網媒所 | 圖論與應用 (CSIE5136) | 黃上恩 | in the 2026-07 list only | GT | https://www.inm.ntu.edu.tw/uploads/asset/data/6a53695c1d41c8068f74032d/%E8%AA%B2%E7%A8%8B%E4%B8%80%E8%A6%BD%E8%A1%A820260706.pdf | E |
| 13 | NTHU 資工 | 社群網路 (11510CS 530600) | 李端興 | 115-1 | NS/SNA? (syllabus not public) | NTHU JSON | V (title) |
| 14 | NTHU 資工 | 圖探勘 (11510CS 573400) | 沈之涯 | 115-1 | GML | NTHU JSON | V |
| 15 | NTHU 生科院 | 圖神經網路與藥物探索特論一 (11510LSBS574500) | 葉善茹 | 115-1 | GML | NTHU JSON | V |
| 16 | NTHU 服科所 | 社會網路分析與管理 (11220ISS 507100) | 王俊程 | 112-2 | SNA | https://khub.nthu.edu.tw/document/courses/11220ISS_507100.html | S |
| 17 | NCKU 資工所 | 圖機器學習專論 (CSIE7647 / P75L600) | 李政德 | 112-1, 114-1 | GML | https://class-qry.acad.ncku.edu.tw/syllabus/online_display.php?syear=0112&sem=1&co_no=P75L600&class_code= | V |
| 18 | NCKU 電通所 | 資料探勘與社群網路分析 (CCE8440 / Q370100) | 黃仁暐 | 101-2→111-2 | GML/SNA | https://class-qry.acad.ncku.edu.tw/crm/course_map/course.php?cono=Q370100&dept=Q3 | V |
| 19 | NCKU 模組化課程 | 複雜系統中的網路結構、模型和特性 (WZ035), 1.5 credits | 朱書賢 (external) | 115-1 (2026-06-29–07-03) | NS | https://modular-course.cge.ncku.edu.tw/course_review.php | E |
| 20 | NYCU 資財 | 圖神經網路之推薦系統與關係推估 (MGIF30104) | 蔡詩妤 | 114-2, 115-1 | GML | https://coz.aa.nycu.edu.tw/course/114/2/537714 | V |
| 21 | NYCU 應數 | 圖論 (SCMA30010) | 傅恒霖 | 114-1 | GT | https://coz.aa.nycu.edu.tw/course/114/1/536702 | V |
| 22 | NYCU 應數 family | 基礎圖論 (SCMA20015), 代數圖論, 拓樸圖論, 圖論專題 | 陳秋媛, 傅恒霖, 林武雄, 翁志文 … | 111-1→115-1 | GT | https://coz.aa.nycu.edu.tw/course/115/1/516711 | V |
| 23 | NYCU 資科工所 | 圖形理論 (CSIC30033) | 林政寬 | 111-1 | GT | https://coz.aa.nycu.edu.tw/course/111/1/535514 | V |
| 24 | NYCU 傳科 | 社會網絡分析; 社會網絡研究 (HKCT20024; HKCT30019) | 賴至慧 | 108-2 … 114-2 | SNA | https://coz.aa.nycu.edu.tw/course/108/2/1789 | V |
| 25 | NYCU 生醫資訊所 | 生物網路分析 (MDBI30088) | 林振慶, 黃宣誠 | 111-1 … 113-1 | NS | https://coz.aa.nycu.edu.tw/course/113/1/131010 | V |
| 26 | NYCU 生資所 | 網路生物學實作及應用 (BTBI30082) | 林峻宇 | every spring 111-2→114-2 | NS | https://coz.aa.nycu.edu.tw/course/114/2/430106 | V |
| 27 | NYCU 科技犯罪偵查在職專班 | 犯罪網絡與大數據分析 (CSCM30033) | 張伊君 | 115-1 (new) | SNA | https://coz.aa.nycu.edu.tw/course/115/1/555900 | V |
| 28 | NYCU 管理學院 | 網路策略：方法與應用 (MGBM30055), EMI | 姜真秀 | 111-1, 115-1 | SNA | https://coz.aa.nycu.edu.tw/course/115/1/230020 | V |
| 29 | NCCU 社會系 | 社會網絡與社會資本 (204780) | 鄭力軒 | 113-2 | SNA | https://newdoc.nccu.edu.tw/teaschm/1132/schmPrv.jsp-yy=113&smt=2&num=204780&gop=00&s=1.html | V |
| 30 | NCCU 社會系 | 個人網絡 (204811, 254775) | 陳人豪 | 113-2 | SNA | https://newdoc.nccu.edu.tw/teaschm/1132/schmPrv.jsp-yy=113&smt=2&num=204811&gop=00&s=1.html | V |
| 31 | NCCU 資科 | 社群媒體概論 (703857), SNA in content | 謝佩璇 | 112-2, 114-1 | SNA | https://newdoc.nccu.edu.tw/teaschm/1141/schmPrv.jsp-yy=114&smt=1&num=703857&gop=00&s=1.html | V |
| 32 | NCCU 社會所 | 社會網絡分析 (254072) | 熊瑞梅 | 108-1 | SNA | https://newdoc.nccu.edu.tw/teaschm/1081/schmPrv.jsp-yy=108&smt=1&num=254072&gop=00&s=1.html | V |
| 33 | NTNU 地理 | 社會網絡分析 | Chun-Hsiang Chan | 112-2, 114-2 | SNA | https://toodou.github.io/SNA/index.html | V |
| 34 | 東海 教研所在職專班 | 社群網絡理論與研究 (1142-6608) | 王承諺 | 114-2 | SNA | https://national.service.thu.edu.tw/view/114/2/6608 | V |
| 35 | 東海 應物 | 複雜網路專題 / 複雜網路 (5325), EMI | 施奇廷 | 103-1 (stale) | NS | https://national.service.thu.edu.tw/view/103/1/5325 | E/S |
| 36 | NCU 資工 | 社群媒體探勘 (CE7066) | 蔡宗翰 | 104-2 (stale) | GML/SNA | https://cis.ncu.edu.tw/Course/main/query/byKeywords?serialNo=52048&outline=52048&semester=1042 | V |
| 37 | NCKU 統計 | 資料科學導論 (H212200), 2 guest lectures | guest 顏子祺 (host 李政德) | 106-2 | NS, partial | http://class-qry.acad.ncku.edu.tw/syllabus/online_display.php?syear=0106&sem=2&co_no=H212200&class_code= | V |

**Shape of the list.**
- **Strict network science is rare: about 8–10 courses** (rows 1–3, 5, 19, 25, 26, plus 4 and 13 depending on labelling). Most of the list is SNA, graph theory and graph ML.
- **ISAC adds about 35 plausible title-level candidates.** One regex over the 113/114 CSVs gave 75 + 10 hits, many at private universities (中原, 東吳, 淡江, 高雄大學, 臺科大, NCU 資管 社會網路分析 114-1 …). "One CSV and one regex produced as many credible candidates as about 80 targeted searches." Each candidate still needs 2–5 minutes of lookup.
- **Non-credit offerings** are modelled with `offering_type` and dates, not terms. Examples:
  - ISSM 2025 (SNA by 謝志昇; https://issm.com.tw/event/detail/34);
  - the NCCU Martin Everett SNA short course, 2024 (https://ccphd.nccu.edu.tw/PageDoc/Detail?fid=12655&id=27757);
  - 中研院社會所 workshops (https://www.ios.sinica.edu.tw/workshop.php?id=21);
  - the NCTS complex-systems winter school (https://www.phys.ncts.ntu.edu.tw/act/actnews/2025-NCTS-Frontiers-of-Complex-Systems-Winter-School-15784366/home);
  - TASN (https://tasn.org.tw/%e5%ad%b8%e6%9c%83%e6%b4%bb%e5%8b%95/).
  - Exclude 網絡統合分析 workshops. Psychometric network analysis is borderline.
- **Borderline (`partial` or out):** NSYSU 數位內容與社會網絡分析 (2 of 16 weeks); NSYSU 社群媒體分析; NCCU 社群媒體資料分析; NTU 離散數學; NYCU OR and transport network courses; and NKUST curriculum-table-only entries.

### 12.5 Course schema, collection strategy, effort [Rec unless verified]

- **Course ≠ offering.**
  - A course has a stable slug, provider, department, zh/en titles, `course_code`, `category` (network-science / social-network-analysis / graph-theory / graph-ml), `relevance` (core/partial), an inclusion note, a maintainer-written summary, keywords, level, languages/EMI and `offering_type`.
  - Its status is computed: active, recent (≤ 4 terms), dormant or historical.
  - An offering has a term, dates, instructors, **mandatory `evidence_url` and `verified_on`**, and optionally an archive URL and serial number.
  - Link to syllabi; never copy them.
- **schema.org** `Course` → `hasCourseInstance` → `CourseInstance`; **`instructor` exists only on CourseInstance** (https://schema.org/Course , https://schema.org/CourseInstance).
- **Google.**
  - Course info rich results were retired: announced 2025-06-12 (https://developers.google.com/search/blog/2025/06/simplifying-search-results), docs removed 2025-09-09.
  - Course list is documented but "available in English" only (https://developers.google.com/search/docs/appearance/structured-data/course).
  - Emit the JSON-LD anyway, for agents.
- **Freshness labels.**
  - 「本學期開課 115-1」.
  - 「最近開課：114-2」.
  - Grey at 3–4 terms.
  - `dormant` 「可能已停開」 after 4 terms, because of 隔年開課.
  - Always show 資料核對日期.
- **Strategies.**
  - A. Manual UI searches: 6–10 h per semester.
  - B. Self-submission: a no-account form plus a GitHub form, ~15 min each.
  - C. Semi-automated discovery over official feeds: 12–25 h setup, 2–4 h per semester.
  - D. A full crawl: **rejected**.
  - E. A web sweep: ~1 h.
  - **Recommended:** a watchlist re-check (~1–1.5 h), discovery twice a year over ISAC plus 5 school feeds with manual checks where automation is discouraged (~2–3 h), and submissions that double as the PDPA correction channel. Run in late July/August and late January/February.
- **Effort.** **~20–30 h one-off, then ~4–6 h per semester.**
  - Per-feed limits: ISAC one 51 MB GET per year; NTHU JSON per semester; NCCU XLSX plus ≤ 20 GETs; NTU XLS archived each semester, never `/api/`; NYCU ~10 POSTs at ≥ 2 s; NTNU ~10 GETs.
  - Run from a Taiwan network. As a courtesy, email the 課務組 at NTU, NCKU and NTNU.
- **Existing entries.**
  - The courses researcher wanted the foreign courses kept on the page `/refs` serves; the architect chose a 301 (§14).
  - **STAT1021** becomes a `historical`, `partial`, `module-in-course` 106-2 offering, with `/stat1021/` kept as an archive. **Disclose that the maintainer was the guest instructor.**

---

## 13. UX and information-architecture findings

### 13.1 URL map and navigation [Rec, UX researcher]

**Principles.**
- Trailing-slash canonical URLs. The prerender writes `x/index.html` anyway, and the S3 website endpoint answers `/x` with a 302 to `/x/` (https://docs.aws.amazon.com/AmazonS3/latest/userguide/IndexDocumentSupport.html).
- ASCII, lowercase, hyphenated segments. No Chinese in paths: percent-encoding looks broken in LINE and Facebook.
- Plural collection nouns. Permanent slugs.
- Provide `TrailingSlashPathLocationStrategy`.

| Path | Page | Index? |
|---|---|---|
| `/` | 首頁: search with a 資料/課程 toggle, a one-line mission, a counts line, 3 news items | yes |
| `/search/?q=…&type=courses` | 搜尋結果: prerendered shell; the `type` default (`datasets`) is omitted | `noindex, follow` |
| `/datasets/`, `/datasets/<slug>/` | the table; detail pages | yes |
| `/wanted/` | 資料許願池, seeded from the 搜集中 items | yes |
| `/courses/`, `/courses/<slug>/` | the table plus `#international`; detail pages with offerings | yes |
| `/news/`, `/news/feed.xml` | a single archive page with anchors; Atom (RFC 4287) | yes / n/a |
| `/about/` | mission, contribute, cite, `#takedown`, `#booklet`, history, maintainer, 給程式與 AI 代理 | yes |
| `/stat1021/` | archive, with a 「2018 年課程封存頁 · Archived」 banner and `lang="en"` | yes |
| `/404/` | served with status 404 | `noindex` |
| `/sitemap.xml`, `/robots.txt`, `/llms.txt`, `/opensearch.xml` (optional), `/files/…` | real files | n/a |
| `/en/` | reserved, unused | n/a |

- **Navigation:** 資料集 · 課程 · 消息 · 關於, which fits a 360 px phone. There is a compact header search on every page except home. 許願池 is linked from `/datasets/`, the empty states and `/about/`.
- **Dataset slugs.** English words; the official English name or toneless Hanyu Pinyin; the year only when the dataset is about a year; never a version; at most about 5 words.
- **Old pages.**
  - `/networks` → `/datasets/`: `datasets` is the cross-catalog convention, and 資料集 is the standard Taiwanese UI term.
  - `/booklet` → `/about/#booklet`, with the PDFs re-hosted under `/files/`.
  - `/tools` → https://github.com/junipertcy/Network-Code-Repository (a 301, which the researcher prefers over a 410).
  - The home essay's core moves to `/about/`.
  - `/refs`: see §14.

**Redirects** (all 301, query string preserved):

| From | To |
|---|---|
| `www.netscied.tw/*` | `https://netscied.tw/*` |
| `/networks`, `/networks/` | `/datasets/` |
| `/refs`, `/refs/` | `/courses/` |
| `/booklet`, `/booklet/` | `/about/#booklet` (a fragment in `Location` is allowed) |
| `/tools`, `/tools/` | `https://github.com/junipertcy/Network-Code-Repository` |
| any extensionless path without a trailing slash | the same path + `/` |
| `/<path>/index.html` | `/<path>/` |
| `http://…` | `https://…` (already done by CloudFront) |

### 13.2 Internationalisation

- **Google.**
  - hreflang must be reciprocal; script subtags are allowed (https://developers.google.com/search/docs/specialty/international/localized-versions).
  - "Google uses the visible content of your page to determine its language"; avoid side-by-side translations and language auto-redirects (https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites).
- **Angular `localize: true`** builds one app per locale, each with **a copy of `public/`** (https://angular.dev/guide/i18n/deploy).
- **Tags.** data.gov.tw uses `zh-Hant-TW`. Script and region both carry information here (https://www.w3.org/International/questions/qa-choosing-language-tags).
- **[Rec] Option (b): one Mandarin page per record with a `<section lang="en">` English abstract** (like 中文摘要/Abstract).
  - Bilingual data fields, Mandarin UI strings in templates, and a small `vocab.ts` for {zh, en} labels.
  - No hreflang; `og:locale` `zh_TW`; `lang="en"` on English fragments.
  - Reserve `/en/` for the future, and avoid `@angular/localize`.
- **UI vocabulary.** 資料, 搜尋, 檔案, 軟體, 程式, 連結, 預設, 設定, 支援, 介面, 影片 (not the mainland forms). Explain 網絡（網路） once.

### 13.3 Search UX [Rec]

- **Form.**
  - A `<search>` landmark (https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/search).
  - A GET form to `/search/` with a **native radio segmented control** (資料 default, 課程).
  - A labelled input, a visible 搜尋 button, and chips that are guaranteed to return results.
- **v1 is submit-to-search,** a real GET. Reasons:
  - It is IME-safe (implicit submission is suppressed while an IME consumes Enter).
  - The URL is shareable.
  - CloudFront logs give a free demand log (IPs are 個資: short retention, disclosed).
  - There is no combobox ARIA.
- **Angular details.** No `(keyup.enter)`. Read `q` after hydration (`afterNextRender`) to avoid NG0500.
- **Results.**
  - A `role="status"` count line with a cross-type hint, and cards with `<mark>`.
  - **Wanted matches in a separate dashed group**, never counted and never given Dataset markup.
  - No facets below about 10 results, and a `<noscript>` fallback.

**Empty state:**
```
本站目前還沒有與「人口遷徙」有關的資料集。      ← "還沒有", not "找不到"
▍許願池裡有相符的需求   人口遷徙網絡 徵求中 · 已有 3 次需求 [我也需要] [我有這份資料或線索]
▍告訴我們你需要什麼資料  [填寫資料需求表] 或寄信 · 在 GitHub 提出   (prefilled with the query; WCAG 3.3.7)
▍到其他資料庫找找看（已帶入「人口遷徙」）  data.gov.tw · depositar · Google 資料集搜尋 · Zenodo · Netzschleuder · ICON · SNAP
▍或者  改搜尋「課程」 · 瀏覽全部資料集 · 看看許願池
```

**External-catalog query URLs** (prefill verified with curl, 2026-11-04):

| Catalog | Query URL | Result |
|---|---|---|
| 政府資料開放平臺 | `https://data.gov.tw/datasets/search?p=1&size=10&s=_score_desc&rft=<q>` | Server-rendered; 102 hits for 交通 |
| depositar | `https://data.depositar.io/dataset/?q=<q>` | 「找到 38 個與「網絡」有關的資料集」 |
| Google Dataset Search | `https://datasetsearch.research.google.com/search?query=<q>` | 200 |
| Zenodo | `https://zenodo.org/search?q=<q>` | 200 |
| Netzschleuder | `https://networks.skewed.de/?search=<q>` | Works (`taiwan` → `cptond_china_transit`). **English only**: send Latin queries or the English synonym |
| ICON / SNAP | `https://icon.colorado.edu/` / `https://snap.stanford.edu/data/` | No query parameter; link the home page |
| 大學校院課程資源網 | — | Link only, at `https://course-tvc.yuntech.edu.tw/WebU/index.aspx`. The UX report lists the dead `ucourse-tvc` host (§15) |

- **Requests.** Fields: 需要的資料 (prefilled), 用途, 可能的來源, 願意公開具名嗎 (default 否), and an optional email, with a 個資 notice. The wanted status runs 徵求中 → 找到來源 → 整理中 → 已上架 | 無法提供.
- **Home.** An H1 「搜尋台灣的網絡資料」, the form, chips, an honest count line (「目前收錄 2 筆資料集、1 門課程 · 7 項資料徵求中」) and 3 news items. No hero image or carousel.
- **WCAG 2.2 AA:** a real label, the landmark, a status region, unobscured focus, 4.5:1 contrast, 24 px targets, consistent help, no redundant entry, `lang="en"` and per-page titles.

### 13.4 Tables, detail page, visual tone [Rec]

- **Tables.**
  - `/datasets/` columns: 名稱 | 領域 | 結構 | 規模 | 時間範圍 | 授權 | 最新版本.
  - `/courses/` columns: 課程名稱 | 學校 | 系所 | 教師 | 最近開課 | 層級 | 授課語言.
  - Prerender the full `<table>`. Sort buttons with `aria-sort` appear after hydration. Collate with `Intl.Collator('zh-Hant-TW')`, which sorts by stroke order.
  - Below 40em, rows become CSS cards. Display changes keep table semantics, except `display: contents` (https://adrianroselli.com/2018/02/tables-css-display-properties-and-aria.html).
  - BOM-less CSV plus an Excel help line.
- **Detail page order:**
  1. title zh/en;
  2. description;
  3. key facts (structure, size, coverage, version, licence, DOI);
  4. download table with SHA-256 prefixes, `SHA256SUMS` and a zip of all formats;
  5. 如何引用, in DataCite order plus BibTeX, and 「重現研究請引用版本 DOI；泛指本資料集可用概念 DOI（永遠指向最新版）」;
  6. attribution string;
  7. collectors (consent-gated; never announce a withheld name; 「本站整理：顏子祺」);
  8. source, with 「來源快照擷取於…」;
  9. version table (版本 | 發布日期 | 來源快照日期 | 變更說明 | 版本 DOI | 檔案);
  10. 個資與下架;
  11. In English;
  12. JSON-LD.
- **Downloads.** The `download` attribute is ignored cross-origin (https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/a), so set `Content-Disposition` as S3 metadata. Add managed SimpleCORS. No `latest/` alias.
- **LINE in-app browser.** It breaks downloads; link `?openExternalBrowser=1` (https://developers.line.biz/en/docs/messaging-api/using-line-url-scheme/).
- **Visual tone.**
  - System fonts (PingFang TC, Noto Sans TC, Microsoft JhengHei) and no web fonts. `lang="zh-Hant-TW"` gives Taiwan-style centred punctuation. Weights 400/700.
  - 16–17 px with `line-height: 1.75`; `line-break: strict`; manual spaces between Han and Latin (`text-autospace` is newly Baseline: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/text-autospace).
  - No italics for Chinese; quotes 「」 and titles 《》.
  - A calm academic look, with nine components.

### 13.5 Hosting mechanics on S3 + CloudFront

**Find the origin type** (owner to run):
```sh
aws cloudfront list-distributions --query "DistributionList.Items[].{id:Id,aliases:Aliases.Items,origin:Origins.Items[0].DomainName}"
aws cloudfront get-distribution-config --id <ID> --query "DistributionConfig.{origins:Origins.Items[].{domain:DomainName,s3:S3OriginConfig,proto:CustomOriginConfig.OriginProtocolPolicy,oac:OriginAccessControlId},root:DefaultRootObject,errors:CustomErrorResponses,fns:DefaultCacheBehavior.FunctionAssociations,cachePolicy:DefaultCacheBehavior.CachePolicyId}"
aws s3api get-bucket-website --bucket <bucket>   # NoSuchWebsiteConfiguration means website hosting is off, so the origin must be REST
```

**S3 facts.**
- `x-amz-website-redirect-location` works only on the website endpoint.
- Routing rules allow 50 per bucket and must set `HostName` and `Protocol` (https://docs.aws.amazon.com/AmazonS3/latest/userguide/how-to-page-redirect.html).
- CloudFront's default root object applies **only** to `/` (https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/DefaultRootObject.html), so on a REST origin `/datasets/` fails unless something rewrites it.
- A missing key returns **403** without `s3:ListBucket` (https://docs.aws.amazon.com/AmazonS3/latest/API/API_GetObject.html).

**One viewer-request CloudFront Function** [Rec] does all URL work, kept in version control. The UX researcher drafted it in about 20 lines of `cloudfront-js-2.0`, based on the AWS sample (https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/example_cloudfront_functions_url_rewrite_single_page_apps_section.html). Runtime 2.0 has no network or body access (https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cloudfront-function-restrictions.html). In order, the function:
1. 301s `www.netscied.tw` to the apex, keeping the query string;
2. 301s the legacy map (`/networks`, `/refs`, `/booklet`, `/tools`, with or without a trailing slash);
3. 301s `…/index.html` to `…/`;
4. 301s extensionless paths to the slash form;
5. rewrites `…/` to `…/index.html`.

Paths with an extension pass through, so `/data/…` files are untouched.
- Test how query values arrive (percent-encoded or not), so that `?q=金馬` survives a 301. The event-structure doc doesn't say (https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/functions-event-structure.html).
- The function size quota (~10 KB?) is unverified.
- Keep Angular `redirectTo` routes as a portable fallback. Google treats a 0 s meta refresh as permanent (https://developers.google.com/search/docs/crawling-indexing/301-redirects), but meta refresh does not help on a bare REST origin, where the function is mandatory.

**Soft-404 fix.**
1. Add a concrete `404` route, which prerenders `/404/index.html`.
2. CloudFront error responses: **403 → `/404/index.html` with code 404**, and the same for 404, with an error-caching TTL of ~60 s. **Delete the mapping to `/index.html` with 200** in the same change as the first prerendered deploy.
3. Ship real `robots.txt` and `sitemap.xml`. The sitemap excludes `/search/` and `/404/`.
4. Verify with curl: `/nope` → 404; `/networks` → 301; `/datasets` → 301; `/datasets/` → 200; `www` → 301; `robots.txt` → `text/plain`.

**Caching and deploy.**
- Hashed bundles: `public, max-age=31536000, immutable`.
- HTML, JSON, feeds and sitemaps: `public, max-age=300, s-maxage=86400`.
- Managed CachingOptimized excludes query strings from the cache key, so every `/search/?q=…` is one cached object. Add SecurityHeadersPolicy.
- Two-pass `aws s3 sync`: hashed assets first without `--delete`, then the rest with `--delete`, plus an explicit Atom content type, then a `/*` invalidation.

---

## 14. Where the researchers disagreed, and how the architect resolved it

Each item gives the competing positions (with the researcher who held them), then the architect's resolution. The owner confirmed the architect's recommended option on all eight checkpoint questions on 2026-11-04 (design.md § Decisions record).

1. **Dataset version identifiers.**
   - Positions: schema researcher, semver with Croissant meaning. Curation researcher, date versions `YYYY-MM-DD[.N]`. UX researcher, plain integers `v1`, `v2`.
   - **Resolution:** semantic versioning with the Croissant 1.1 meaning:
     - PATCH = same data repackaged;
     - MINOR = data added;
     - MAJOR = data changed or removed.
     The release date and the upstream-snapshot date are shown separately.
   - **Rejected:** plain integers (UX) and date versions `YYYY-MM-DD[.N]` (curation). Date versions conflate snapshot date with release identity, and integers carry no compatibility signal.
2. **Where data files live.**
   - Positions: schema, curation and UX researchers, a `data.netscied.tw` host. Storage researcher, one distribution with two origins.
   - **Resolution:** `https://netscied.tw/data/<id>/<version>/` on the existing CloudFront distribution, with a second private S3 origin, not a `data.netscied.tw` subdomain.
   - **Why:** a CloudFront flat-rate plan covers one distribution and one apex domain, and whether two plans can share an apex was unverified (§8.1, §8.7).
3. **Repository layout.**
   - Position: curation researcher, a separate public `netscied-data` repo.
   - **Resolution:** one repository, the existing `netscied-web`, with two trees:
     - `catalog/`: records, version manifests, public person records, vocabularies;
     - `curation/`: the Python pipeline pinned with uv, recipes, discovery.
   - **Rejected:** a separate `netscied-data` repo, for one-maintainer simplicity and atomic PRs. It can be split later.
4. **Person ids.**
   - Positions: schema researcher, sequential `p0001`. Curation researcher, random ids.
   - **Resolution:** opaque random ids, `"p-"` plus 8 Crockford base32 characters (the curation researcher's proposal).
   - **Why:** sequential ids reveal how many people are hidden.
5. **Names of the personal-data levels and licence classes.**
   - Positions: the Taiwan-data researcher used tiers A/B/C/D; the curation researcher used licence classes A–G; the schema researcher used levels none / public-role / pseudonymized / identifiable.
   - **Resolution:**
     - Personal-data levels are **none / public-role / private-individuals / sensitive**, equivalent to the Taiwan-data researcher's tiers A/B/C/D.
     - Licence classes are **permissive / share-alike / non-commercial / no-derivatives / link-only / permission**, plus a **personal-data hold**.
     - Letters are not used, to avoid two different A–D scales.
6. **Snapshots of upstream data.**
   - **Resolution:**
     - Redistributable upstream files are kept byte-for-byte and published under `original/`, both in the version directory and in the Zenodo deposit.
     - Landing pages are captured with Internet Archive Save Page Now. A private WARC and a private evidence bucket are deferred to the follow-up change `add-archive-and-outreach`.
     - For data we may not redistribute, we keep only hashes and headers, plus a temporary copy on the maintainer's own machine while permission is pending. That copy is deleted after 180 days or on refusal.
7. **Canonical formats.**
   - **Resolution:**
     - **Graphs:** a csv-bundle (`nodes.csv` + `edges.csv` + Frictionless `datapackage.json`), with GraphML as convenience. GML is optional, Parquet is used above ~5M edges, and graph-tool `.gt` is optional.
     - **Hypergraphs and simplicial complexes:** HIF JSON (`asc` for simplicial complexes).
     - **Rankings:** PrefLib.
     - **Pairwise comparisons:** a comparisons CSV.
8. **Search.**
   - **Resolution:**
     - Static MiniSearch with bigrams, T→S folding, a concept/alias table and a gold-set CI gate.
     - A server endpoint only when `catalog.json` exceeds 150 KB gz or about 500 records.
     - Semantic search only on evidence.
9. **Hosting** (owner decision Q2, 2026-11-04: as resolved).
   - **Resolution:**
     - Stay on AWS: private buckets with OAC, one CloudFront Function, real 404s.
     - Use the CloudFront flat-rate Free plan, moving to Pro at about 100 GB or 1M requests/month.
     - Per-file ceiling: 100 MB on the Free plan, because data and HTML share its 100 GB allowance; 2 GB on Pro. Larger files are served from Zenodo once the archive change lands.
     - A WAF rate rule on `/data/*`.
     - The new data bucket is in ap-east-2 Taipei.
     - Flip to Cloudflare at the thresholds in the cost model (§8.6).
10. **Contribution channels** (owner decision Q5, 2026-11-04: a Google Form, GitHub Issue Forms and email).
    - Positions: the schema researcher recommended against Google Forms; the UX researcher recommended for it.
    - **Resolution:**
      - GitHub Issue Forms for dataset suggestions and corrections.
      - Email for takedown and permission letters.
      - A no-account web form for data requests.
11. **MCP.**
    - **Resolution:** a separate later OpenSpec change (`add-mcp-server`), triggered at about 15–20 real datasets or by demand. This change reserves `/mcp` and makes `/api/v1` the data source.
12. **`/refs`.**
    - Positions: UX researcher, redirect. Courses researcher, keep `/refs` as a page.
    - **Resolution:** `/refs` → 301 → `/courses/`, with the foreign courses in `/courses/#international` (UX).
13. **Researcher credit.**
    - **Resolution:**
      - Bibliographic credit (names as published in a cited work) is always shown.
      - Person credit records (affiliation, ORCID, homepage) appear on dataset pages only with recorded consent.
      - No separate researcher profile pages in this change.
14. **Revisions after the red-team review** (architect, 2026-11-04).
    - **Scope:** this change is now Phase 0 plus the MVP. Deferred to the follow-up `add-archive-and-outreach`:
      - Zenodo deposits and DOIs;
      - structured outreach tooling;
      - discovery harvesters and AI triage;
      - form fetches;
      - the course discovery script;
      - DCAT and Croissant exports.
    - **Why:** the review estimated the first draft at 280–435 h to build and 16–33 h/month to run. The revised budget is about 150–225 h and about 4.5–6 h/month (design.md D13).
    - **`/stat1021`:** kept as an archived page with all its 2018 links. Owner decision (2026-11-04): the class questionnaire and its data, including the `junipertcy/networkie` repository, were published with the participants' consent and stay linked and unchanged.
    - **Flat-rate plan constraints** (AWS docs, checked 2026-11-04, https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/flat-rate-pricing-plan.html):
      - Access logs are Pro and above only.
      - Custom response-header policies are Business and above only; managed ones (SimpleCORS) work on every tier.
      - The Free plan allows 5 cache behaviors.
      - CloudFront Functions are included on every tier.
      - Custom error responses are not on the unsupported list.
    - **Dataset slugs are fixed:** `golden-horse-2018-nominations`, `twnic-interconnection-bandwidth`, `ly-bill-cosponsorship-10th`, `taipei-metro-od-monthly`.
    - **Domains:** the 9 domains of the schema research replace the old 6 headings everywhere, including a future MCP `topic` enum. Bipartite, temporal and multilayer are properties, not kinds.
    - **robots.txt** does not disallow `/search/`, so crawlers can see its `noindex`.

---

## 15. Unverified items and open risks (merged)

### 15.1 Contradictions between the research files

**Status:** the architect settled these in design.md (D2 hosting details, D3 identifiers and levels, D4 gold set, D7 robots, D11 course portal URL) and in §14 item 14. Items left open are the two date discrepancies (Taipei region GA 2025-06-05 vs 2025-06-06; PDPC reply 2026-05-21 vs 2026-06-03) and the SciDM file-limit and DOI discrepancy. None of them affects the design.

1. **Taipei region GA date.** `research-storage-cost.md` gives 2025-06-05; `research-curation.md` gives 2025-06-06. Both cite https://aws.amazon.com/blogs/aws/now-open-aws-asia-pacific-taipei-region/.
2. **Date of the 籌備處's reply to the LY.**
   - `research-taiwan-data.md` says the written reply is dated 115.6.3 (2026-06-03).
   - `research-curation.md` says the office told the LY "on 2026-05-21".
   - Both cite the same PDF, whose path contains `2026051233`. Use the date printed in the PDF.
3. **SciDM.** The two researchers disagree on DOIs and file limits:
   - `research-storage-cost.md`: single file 10 GB system limit (≤ 2 GB recommended), and "No DOI issuance seen".
   - `research-curation.md`: upload limit 2 GiB (`status_show`), and free DOIs via Airiti for approved organisations, with an example DOI.
4. **The schema's JSON Schema predates §14.**
   - `personal_data.level` enum: none/public-role/pseudonymized/identifiable.
   - `personId` pattern: `^p[0-9]{4,}$`.
   - Version manifest URLs: `https://data.netscied.tw/…`.
   - Layout: `catalog/people/p0001.yaml`.
   - The schema-lab examples need regenerating.
5. **Slugs for the same dataset differ between reports.**
   - 金馬: `golden-horse-2018-nominations` (schema, UX) vs `jinma-2018-nominations` (curation, agents).
   - TWNIC: `twnic-interconnection-bandwidth`, `twnic-internet-nodes-bandwidth`, `twnic-bandwidth` and `twnic-backbone`.
   - Pick one before first publish; slugs are permanent.
6. **The dataset page path.** `research-curation.md` §3.2 says permanent slugs at `netscied.tw/networks/<slug>`; everyone else uses `/datasets/<slug>/`.
7. **Domain vocabulary.**
   - `research-schema.md` proposes 9 domains.
   - `research-ux-ia.md` and `research-agents-mcp.md` (`taxonomy.json`, the MCP `topic` enum) reuse the old 6 headings.
   - The MCP `kind` enum treats bipartite, temporal and multilayer as kinds, while the schema treats them as properties.
   - §14 does not resolve the domain list.
8. **API file layout.** The reports propose different paths:
   - `research-search.md`: `/api/v1/catalog.json` and `fold.json`;
   - `research-agents-mcp.md`: `/api/v1/index.json`, `datasets.json`, `search-index.json`;
   - `research-ux-ia.md`: `/datasets/index.json` and `/datasets/<slug>/index.json`.
   Harmonise them.
9. **The robots.txt rule doesn't match the URL scheme.** `research-agents-mcp.md` suggests `Disallow: /search?`, but `research-ux-ia.md` uses `/search/?q=…`, which that rule does not match. Use `Disallow: /search/` together with `noindex`.
10. **The free tier under flat-rate.** `research-search.md` §5 says "CloudFront always-free covers 10M requests per month". Under the adopted flat-rate Free plan the allowance is 1M requests/month (Pro at 10M). Search assets, catalog fetches and agent traffic count toward the Pro trigger.
11. **A bucket name that suggests a public bucket.** `research-curation.md` names a `netscied-data-public` bucket "behind CloudFront". Under §14 every bucket is private with OAC, even when its contents are public.
12. **A gold-set query against the content policy.** Query 21 (社群網路 PTT) in `research-search.md` expects PTT interaction datasets, but `research-taiwan-data.md` places private-user PTT/Dcard graphs at level `sensitive` (do not host). Change it to a forbidden or expect-zero case. Query 27 (higher-order courses) has no matching seed course.
13. **The 課程資源網 host.** `research-ux-ia.md` links `ucourse-tvc.yuntech.edu.tw`, which `research-courses.md` reports dead; the live host is `course-tvc.yuntech.edu.tw`.
14. **Small numeric and wording issues.**
    - `research-storage-cost.md` says R2 "saves ≥ $34/month" at 2 TB, but its own table gives $33.90.
    - `research-search.md` quotes "Claude Haiku 5.5" at $0.10/$0.50 per MTok from cached skill data, not a pricing page.
    - `research-courses.md` row 4 lists both 鄧雅文 (NCCU 115-1) and 陳宜欣 ("fall 2026" = 115-1) for TIGP Social Networks; confirm whether these are two sections.
    - The MCP `search_courses` level enum (undergraduate/graduate) is coarser than the course schema's level enum.
15. **`proposal.md` conflicts with §14.** It still says "immutable integer versions" and "New `content/` …", whereas §14 adopts semver and a `catalog/` + `curation/` layout. The data-curation and site-hosting specs already use semver and `/data/<id>/<version>/`.
16. **Required English title.** The schema makes `title.en` required for published records; the UX researcher treats English as optional per record.

### 15.2 Unverified facts

- **Hosting and cost.**
  - Everything in §8.7.
  - Whether custom error responses, the 5-cache-behaviour limit (default, `/data/*`, `/api/*`, `/mcp*`) and managed-only response-header policies all fit the Free plan.
  - The function size quota and query encoding; the origin endpoint type; Lambda in Taipei; CloudFront → workers.dev as an origin.
- **Search.** The phone slowdown factor, cross-browser ICU, and Android Gboard and old iOS Safari IME behaviour. The gold set is self-authored and overfit.
- **Agents and MCP.**
  - Mandarin-specific AI citation behaviour (reasoned, not measured).
  - ChatGPT MCP plan gating; Smithery and PulseMCP status; registry GA or resets.
  - `__usage_ai-training` vendor dates.
  - Whether Angular's inline CSS and `ng-state` crowd Claude Code's 100k-character window (test with curl and Turndown).
- **Courses.**
  - 台灣聯合大學系統 membership; 大學法施行細則 §23.
  - The NTHU 社群網路 syllabus.
  - E/S rows and ISAC-derived rows (titles only); the NCU IM5001 code.
  - ISAC 學期別 3/4; moocs.moe.edu.tw (403).
- **Taiwan data.**
  - KONECT, TDCS and Judicial Yuan reachability from a Taiwan IP.
  - The GCIS file (HTTP 500); TDX GTFS; EcoBase model cards.
  - The direction of 遷入地 (TW-09); Zenodo 15864841's contents and author.
- **UX.** Whether the dead PDFs (網絡素養 zh, the Binghamton original, 4 STAT1021 files) still exist; `as_sitesearch`; an ICON query parameter.

### 15.3 Open risks

- **Law.**
  - The PDPC is not established, and the 2025 amendment has no effective date. Art. 20-1 security rules, breach reporting and audits could start at short notice. Re-check before launch and yearly.
  - The research exception is unavailable to an individually run site.
- **Licences and provenance.**
  - Unresolved: 金馬 authorship and licence, TWNIC (no licence), Zenodo 15864841 (anonymous), EcoBase (an agreement, not a licence).
  - License ambiguity slows the re-hosting rate.
  - NC data are acceptable only while the site stays non-commercial.
  - BY-SA and ODbL must never be mixed in one composite.
  - Zenodo invalidates duplicate DOIs, so check `upstream_doi` before depositing.
- **Personal data in public places.**
  - Git history is permanent: run a CI PII scan with an allowlist schema.
  - Erasure in the private repo needs a history rewrite and backup rotation.
  - Nothing with named individuals is published or deposited until the personal-data review passes.
- **Labelling and politics.** Foreign catalogs file Taiwanese data under "China" (the Netzschleuder CPTOND title, EcoBase country fields). Our metadata should state locations neutrally and note the discrepancy.
- **Upstream fragility.**
  - Withdrawals under OGDL §5 and judicial deletion duties need sync.
  - CSRF forms (TWNIC), the Anubis wall (depositar), old CKAN (SciDM), key-gated APIs (data.gov.tw list, OpenAlex), geo/IP filtering, and NTU's possible auto-ban all mean some fetches will be manual.
  - System migrations break course evidence URLs, and NTHU syllabi are never linkable.
- **Operations.**
  - Public-repo scheduled workflows auto-disable after 60 days of inactivity.
  - Agent-sweep prompt injection and hallucinated licences (mitigated by evidence quotes and deterministic classing).
  - Bus factor: a single Zenodo owner and a single age key. Add a co-curator and a succession plan, e.g. hand-off to depositar or an institutional repository.
- **Vendors.**
  - Flat-rate plan terms can change ("requiring a change to your pricing structure").
  - Registry previews, MCP spec churn, Orama's pivot, Google feature churn (Course list is English-only and could be retired), and Croissant's uneven 1.0/1.1 adoption.
- **Scale and coverage.**
  - With about 5–40 records, most queries will legitimately return nothing, so the empty state and the wanted list carry the experience.
  - Strict network-science courses number about 8–10. Private universities are covered only through ISAC titles, and ISAC lags about a year.
- **Privacy of logs.** CloudFront logs and any search beacon contain IPs (個資). Short retention and a privacy note are required, and any server-side search changes the privacy posture.
