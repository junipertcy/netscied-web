> **Status:** owner decisions Q1–Q8 recorded 2026-11-04 (§ Decisions record). Factual items that are still open, and what changes if their answers differ, are in § Open items for the owner. Evidence and source URLs for every number here are in `research.md`. Legal positions are design assumptions, not legal advice.

## Context

See proposal.md § Why for the motivation. The constraints that shape the design:

- **One maintainer, personal funding.** The steady-state target is **at most about 6 hours a month of operations**, plus new content at whatever pace the owner chooses (budget in D13). There is no always-on server, and the monthly bill must be bounded.
- **Static hosting today.** Angular 22 with every route prerendered. The files are in S3 bucket `netscied.tw` (Seoul, ap-northeast-2), behind CloudFront, which uses the S3 *website* endpoint as origin. DNS is on Route 53; the registrar is Gandi.
- **What the live site does today** (verified 2026-11-04). It is still the 2020 SPA:
  - Every miss returns `index.html` with status 200, including `/robots.txt`, `/sitemap.xml` and `/.well-known/*`.
  - The bucket is **publicly readable** through both S3 endpoints, bypassing CloudFront.
  - `www.netscied.tw` serves a duplicate site.
  - S3 versioning is on, with no lifecycle rule.
  - The new prerendered build is not deployed, and it produces no 404 page.
- **Content today:**
  - 2 real datasets. The 金馬獎 2018 JSON (174 nodes, 146 edges, 133 unique pairs) covers nominees of every role, not only actors, and its license is unknown. TWNIC is externally hosted at map.twnic.tw behind a token form, with no stated license.
  - 7 placeholders and 4 news items (2018–2019).
  - `/refs` lists mostly foreign courses.
  - `/stat1021` is the archived page of the 2018 NCKU guest lectures, with links to the class questionnaire, its data and the `networkie` repository; the participants consented to their publication (owner decision, D12).
- **Audience:** Taiwanese citizens typing Traditional Mandarin with Zhuyin or Cangjie, often inside LINE's in-app browser. AI agents mostly do **not** run JavaScript; only Googlebot and Applebot render it.
- **Landscape:** Taiwan network data is almost absent from Netzschleuder, ICON, SNAP and KONECT. It lives on data.gov.tw (52,539 of 52,581 datasets are under 政府資料開放授權條款－第1版), LYAPI/立法院, sports and civic-tech sites, and with individual researchers.

## Goals / Non-Goals

**Goals:**
- A person or an agent can find, judge, download, verify and cite a Taiwan relational dataset in under a minute, in Mandarin or English.
- One source of truth per fact, in the repository. Pages, JSON API, search index, JSON-LD, sitemap, feed and llms.txt are all generated from it.
- Useful with 8 datasets: honest counts, a wanted list that turns searches into the roadmap, external catalog links, and courses.
- Infrastructure that scales to thousands of records and terabytes through named later changes with explicit triggers, not a redesign.
- Careful by default under 個人資料保護法 and third-party licenses.

**Non-Goals (this change; each has a named follow-up in D13):**
- Archival deposits and DOIs, structured researcher outreach tooling, automated or AI-assisted discovery sweeps, and course discovery scripts (`add-archive-and-outreach`).
- An MCP server (`add-mcp-server`).
- Server-side, semantic or LLM-assisted search (`add-search-endpoint`).
- An English mirror (Q6), and researcher profile or directory pages (Q1).
- DCAT and Croissant exports. They are cheap to add later from the same records; no consumer needs them yet.
- Accounts, comments, uploads through the site, analytics, advertising.
- Re-hosting person-level data about private individuals.
- Visualizations beyond links to existing ones.

## Architecture overview

```
 repo (public: netscied-web)                                  private (outside every public system)
 ├─ catalog/datasets/<id>.yaml        human-edited             └─ netscied-people (private GitHub repo):
 ├─ catalog/versions/<id>/<semver>.json  machine-written           people, permissions, consents, evidence;
 ├─ catalog/courses/<id>.yaml                                      encrypted backups, rotated ≤ 3 months
 ├─ catalog/people/p-XXXXXXXX.yaml    consented, allowlisted fields only (hand-edited via PR)
 ├─ catalog/vocab/*.yaml   domains, tags, licenses, formats, concepts (search aliases)
 ├─ catalog/ids.lock       catalog/search-gold.yaml
 ├─ content/news/*.md      config/redirects.yaml
 ├─ schemas/v1/*.schema.json          JSON Schema 2020-12
 ├─ curation/   Python (uv-pinned): fetch, convert, stats, manifest, upload (approval-gated)
 ├─ search/     TypeScript search core (browser, CI eval, and later an endpoint or MCP)
 ├─ infra/      CloudFront Function + tests, rollback configs
 └─ src/        Angular 22 app, prerendered from the generated catalog

 build (CI):  validate ─► generate into a build dir (catalog.json, /api/v1/*, .md siblings,
              sitemap, feed, llms.txt, fold map) ─► search gold set ─► ng build (prerender)
 deploy:      upload hashed assets ─► upload HTML/JSON ─► invalidate;  data upload = separate approved job

 CloudFront (flat-rate plan; WAF rate rule on /data/*) ──────────── viewer-request Function
   │   (www→apex, redirect map, trailing slash, index.html rewrite; fails open)
   ├─ default → S3 netscied.tw    (existing bucket, private via OAC)  403/404 → /404/index.html (404)
   └─ /data/* → S3 netscied-data  (new, private via OAC)             immutable, CORS, Content-Disposition
```

## Decisions

### D1. Static site generated from content files in the repo
YAML records in `catalog/` and Markdown news in `content/` are the source of truth. A Node build script validates them and emits everything the Angular prerender and the machines consume. Generated files go into a build directory, not into `public/` in the source tree. Angular's server routes use `getPrerenderParams` to emit one page per record.
- *Why:* zero runtime cost, every change is a reviewable diff, and it uses the toolchain the site already has.
- *Alternatives:* a headless CMS (another service, with drafts outside git); a database with server rendering (an always-on server).

### D2. Hosting and storage: stay on AWS, close the bypass, cap the bill (Q2)
1. **Phase 0a closes the public bucket first**, independent of everything else. Create an OAC and a bucket policy for the distribution. Point the origin at the REST endpoint through OAC, while keeping today's error mapping so the old SPA keeps working. Turn on Block Public Access. Add a Budgets alert. This is a small, reversible change that ends direct S3 downloads.
2. **Phase 0b fixes HTTP semantics** with the first deploy of the prerendered build:
   - One CloudFront Function (viewer request, `cloudfront-js-2.0`, under the 10 KB limit, wrapped in try/catch so it passes requests through on error). It does www→apex, the redirect map from `config/redirects.yaml`, the trailing-slash 301, the `…/index.html` 301, and `/x/` → `/x/index.html`.
   - A concrete `/404/` route; error responses 403/404 → `/404/index.html` with status 404 (replacing index.html/200).
   - A real `robots.txt` and `sitemap.xml`.
   - The flat-rate plan.
3. **Two private buckets on one distribution:**
   - `netscied.tw` (existing) holds the site.
   - `netscied-data` (new, in **ap-east-2 Taipei**: data stays in Taiwan, and storage is about 10% cheaper than Seoul) holds `/data/<id>/<version>/`.
   - Flat-rate Free and Pro allow only *managed* response-header policies (custom ones are Business+), so CORS uses the managed **SimpleCORS** policy on `/data/*` and `/api/*`. `Cache-Control` and `Content-Disposition` are set as S3 object metadata at upload.
   - The Free plan allows 5 cache behaviors: default, `/data/*` and `/api/*` use three, leaving one for `/mcp` later.
   - No separate private evidence bucket until the archive change.
4. **Billing:**
   - The **CloudFront flat-rate Free plan** ($0; 100 GB, 1M requests, 5 GB S3 credit; WAF and the Route 53 zone included; no overage charges).
   - **Pro** ($15/month; 50 TB, 10M requests) when traffic is sustained above about 100 GB or 1M requests a month, or when files over 100 MB need hosting.
   - The plan's mandatory WAF web ACL gets one rate-based rule on `/data/*`, and must be checked so it does not challenge the crawlers agent-access promises to allow.
   - A Budgets alert catches storage creep.
5. **Per-file ceiling:** 100 MB per hosted file on the Free plan, which leaves room before one popular file exhausts the 100 GB allowance shared with the HTML. On Pro the ceiling is 2 GB. Larger files wait for the archive change and are served from Zenodo. Large raw sources (for example monthly MRT OD at about 300 MB) are hosted as aggregates.
6. **Lifecycle:** expire noncurrent versions after 30 days and CDN logs after 90 days.
7. **Logs:** access logs are a Pro-and-above feature (verified on the AWS flat-rate docs, 2026-11-04), so the Free plan has none. On Pro, logs are kept 90 days and disclosed. Because search is a GET navigation, `/search/?q=…` loads in the logs show what people look for. Zero-result status is computed in the browser, so the D4 semantic-search trigger replays logged queries offline through the same search core; it can only fire after Pro. Custom error responses are not among the plan's unsupported features; task 2.6 confirms them before the 404 cut-over.

**Cost model summary** (full model, formulas and assumptions in research.md § Storage and cost; USD/month):

| Scenario (stored / monthly egress) | AWS pay-as-you-go (with free tier) | AWS flat-rate | Cloudflare R2 + Workers | Zenodo serves data |
|---|---|---|---|---|
| S1 today, ~10 datasets (1 GB / 6.5 GB) | 0.52 | **0.00** (Free) | 0.00 | 0–0.52 |
| S2 ~200 datasets (150 GB / 525 GB) | 4.10 | 17.35 (Pro) | 2.07 | ~0.04–0.54 |
| S3 thousands incl. large temporal (8 TB / 5.15 TB) | 622.62 | 183.81 (Pro) | 112.35 | 0.94–15.17 |
| S3 + stress (20 GB file × 500 downloads) | **1,717.62** | 183.81 | 112.35 | same |
| S3 with files > 2 GB on Zenodo (1.3 TB / 3.15 TB) | 263.19 | **43.39** (Pro) | 18.85 | n/a |

- **Where the money goes.** "Storage is cheap and egress dominates" holds only past CloudFront's 1 TB/month always-free allowance. In S1 the bill is the $0.50 Route 53 zone. In S2 on pay-as-you-go it is mostly storage. Once egress is free per byte (flat-rate, R2, Zenodo), storage is 90–100% of the bill.
- **The real risk is the uncapped tail.** A bot pulling 1 Gbps costs about $30k/month on pay-as-you-go, and more through today's public bucket. The flat-rate plan, closing the bucket, and the per-file ceiling are the caps.
- *Alternatives:*
  - Pay-as-you-go plus alerts: cheapest today, but no hard cap, and budgets alert 8–12 h late.
  - Cloudflare R2 + Workers static assets: zero egress and cheaper beyond ~2 TB stored, but 1–2 days of migration, DNS moving to Cloudflare, and a new vendor.
  - Backblaze B2 behind Cloudflare: three vendors and a terms grey zone.
  - GitHub Pages or Releases, or Hugging Face, as the primary host: acceptable-use and size limits.
  - Taiwan options: TWCC shut down on 2026-08-31, TWAREN serves institutions only, and depositar and SciDM are repositories, not CDNs.
- *Flip to Cloudflare when any one holds:* requests above 10M/month for 2–3 months; hot data above ~2 TB; sustained transfer above 50 TB/month; or the flat-rate terms change or the account is ineligible. Egress-out cost grows with stored TB, although AWS waives it on request for a full move, so migrate early if a threshold looms.
- *Data path:* `/data/` on the apex, not `data.netscied.tw`. A flat-rate plan covers one distribution and one apex, and whether two plans can share an apex was not verified.

### D3. Records, schemas and identifiers
- **Files.**
  - One YAML 1.2 file per dataset (`catalog/datasets/<id>.yaml`), including `wanted` and `withdrawn` records.
  - Append-only, machine-written JSON version manifests (`catalog/versions/<id>/<semver>.json`) hold the files (URL, bytes, SHA-256, media type, conformsTo), statistics, the upstream snapshot reference (URL, retrieved_at, sha256), the changelog, and the DOI once one exists.
  - Courses are `catalog/courses/<id>.yaml`, with an `offerings[]` list nested inside each course.
- **Validation:** JSON Schema 2020-12 with ajv 8 (`ajv/dist/2020` + `ajv-formats`), plus a cross-file script. It checks:
  - the file name equals the id; ids are unique and covered by `ids.lock`;
  - SPDX membership against a pinned `licenses.json`; person references resolve;
  - link-only versus hosted consistency; manifest immutability against `origin/main` (CI uses `fetch-depth: 0`);
  - the personal-data rules and the PII regex scan.
  
  Missing recommended fields produce warnings. A prototype of the schema accepted 5 good records and rejected 13 deliberately bad ones.
- **Effort per record:** the required core of a link-only record is about 15–30 minutes, longer when the license needs research.
- **Structure:** `kinds[]` (graph, hypergraph, simplicial-complex, cell-complex, ranking, pairwise-comparison, other-relational) plus typed properties:
  - directed; weighted, with the weight's meaning; signed; multi_edges; self_loops;
  - partite, with partitions; layers; temporal, with resolution; spatial;
  - node and edge attributes; simplicial; ranking.data_type (PrefLib); comparison.outcome.
  
  Multilayer and temporal are properties, not kinds.
- **Domains:** 9 bilingual ids (society, politics, culture, economy, transport, technology, information, life, health), crosswalked to ICON, Netzschleuder and the old six headings. Subjects go in open `tags`.
- **License and redistribution:** `license.id` is an SPDX id (`OGDL-Taiwan-1.0` verified), `LicenseRef-*`, `NOASSERTION` or `NONE`, with `license.attribution` (OGDL's 顯名聲明). The license class is computed in code, and it constrains `redistribution.basis`:

  | License class (computed) | Examples | `redistribution.basis` | Host? | Derive? |
  |---|---|---|---|---|
  | permissive | CC0, CC BY, ODC-By, OGDL-Taiwan-1.0 | license-permits | yes | yes |
  | share-alike | CC BY-SA, ODbL | license-permits | yes | same license only |
  | non-commercial | CC BY-NC(-SA) | license-permits | yes, while non-commercial | same license |
  | no-derivatives | CC BY-ND, BY-NC-ND | license-permits | yes | lossless conversion only |
  | link-only | none, NONE, NOASSERTION, restrictive terms | link-only | no | no |
  | permission | any, plus a written grant | written-permission + `permission_ref` | per grant | per grant |
  | (site's own compilation) | facts compiled by the site | own-work (released CC BY 4.0) | yes | yes |

- **Personal data:** `personal_data.level` ∈ none / public-role / private-individuals / sensitive, plus `reviewed_on`, notes, and an ethics reference. The research proposed letter tiers and a pseudonymized/identifiable enum; they are unified here, and pseudonymized person-level data counts as private-individuals or sensitive.
- **Identifiers:** dataset ids are permanent English kebab-case slugs, with `aliases` and an append-only `ids.lock`. Fixed now, because the research used several variants: `golden-horse-2018-nominations`, `twnic-interconnection-bandwidth`, `ly-bill-cosponsorship-10th`, `taipei-metro-od-monthly`. Person ids are random `p-` + 8 Crockford base32 characters; sequential ids would reveal how many people are hidden. Courses get readable slugs.
- **Mappings:** schema.org `Dataset` JSON-LD per page plus `DataCatalog`, and a Markdown sibling per record. The crosswalks to DCAT v3, Croissant 1.1 and DataCite are kept in research.md for later use.
- *YAML traps handled:* version-like fields are `type: string` (`1.10` would parse as 1.1); block style for text with ASCII commas; CJK line joins without inserted spaces.
- *Alternatives:* JSON records (no comments, unreadable long text); CSV (no nesting); Frictionless or Croissant as the source format (they describe files, not catalog semantics).

### D4. Search: static, lexical, Mandarin-aware, gated by assertions
- **Engine:** MiniSearch 7.2 (5.9 KB gz), lazily loaded on focus or on `/search/`, over `/api/v1/catalog.json` (records plus concept aliases; about 10 KB gz at 40 records, 141 KB at 500).
- **Normalization** (identical at index and query time; displayed text is untouched):
  - NFKC, then lowercase.
  - Per-character Traditional→Simplified folding with OpenCC `TSCharacters` + `TWVariantsRev`. It is many-to-one, so it is deterministic and also folds 臺/台. The table is cut at build time to the corpus's own characters (about 1–5 KB).
  - A phrase fold makes 網絡 and 網路 the same.
  - CJK character bigrams plus Latin words.
  - Query only: strip Bopomofo and filler words; truncate to 100 characters.
  - Measured: bigrams beat `Intl.Segmenter`, which splits 超圖, 旅次 and 複形 and ignores the locale, and jieba-wasm, which is 2.8 MB gz and misparses 臺北.
- **Concept/alias table** (`catalog/vocab/concepts.yaml`): bilingual labels and synonyms per taxonomy id (超圖/hypergraph, 二分/二部圖/bipartite, 捷運/MRT/地鐵/旅次, 立委/連署/cosponsorship…). This is what lets English and mainland-vocabulary queries reach Mandarin-only records. A toy ablation scored MRR 1.00 with the table and 0.75 without; that set is overfit, so treat it as a smoke test only.
- **Four query rules:**
  - generic-term coverage;
  - computer-networking intent demotes non-internet records;
  - a hint when a mode word appears (課程 in data mode);
  - fuzzy matching only for Latin words of 6+ letters.
  
  Field boosts: title 4, keywords 2.5, aliases 1.5–2, en 1.5, description 1.
- **UX:** a native GET form with a radio toggle, so Enter during IME composition never submits; no live search in v1; the query is read after hydration; wanted matches in a separate group; facets only above about 10 hits.
- **Gate:** `catalog/search-gold.yaml` (adapted from the 27-query outline in research.md: for example, 社群網路 PTT expects the empty state, because such data is `sensitive`) holds at least 20 queries with expected and forbidden ids, plus automatic Simplified, 臺/台 and full-width invariance checks. These are assertions, not metric baselines, which keeps upkeep to minutes per new record. Unpublished ids are skipped.
- *Why not the alternatives:*
  - Pagefind 1.6 segments Chinese now, but requires every term to match (natural-language queries return nothing), missed 臺/台 and Simplified queries, and would be a second implementation outside CI.
  - Orama scored MRR 0.67 and Fuse.js 0.64.
  - In-browser embeddings need a 98–570 MB model download.
  - Hosted SaaS free tiers are too small or gone.
- *Upgrade path:*
  1. When `catalog.json` exceeds **150 KB gz** (about 300–500 records), `add-search-endpoint` moves search to `GET /api/search` on a Lambda function URL behind CloudFront, running the same TypeScript core (≈ $0 in the free tier).
  2. Semantic hybrid search (server-side bge-m3 or Qwen3 embeddings, fused with RRF and a similarity floor) only on evidence: more than 10% zero-result queries over at least 200 logged queries, replayed offline, that aliases cannot fix.
  3. LLM query rewriting only as an opt-in mode.
  
  Traffic never triggers an upgrade.

### D5. Mandarin-first language (Q6)
- UI text is Traditional Mandarin, written directly in the templates. A small `vocab` module provides zh/en labels for badges, JSON-LD and search.
- Records carry zh and en fields, and each detail page has an 「In English」 `lang="en"` section.
- `<html lang="zh-Hant-TW">`, Open Graph `zh_TW`, no hreflang (there is no alternate page), `/en/` reserved.
- *Alternatives:* `@angular/localize` (a build per locale, a translation-file workflow, and the data still untranslated); a full `/en/` mirror with an in-house dictionary (a later change, on demand).

### D6. Information architecture and legacy URLs
- Pages, navigation, news and the redirect map are in the site-structure spec. Navigation is 資料集 · 課程 · 消息 · 關於. 許願池 (`/wanted/`) is linked from the dataset table, the empty search state and the about page.
- **`/networks` → `/datasets/`.** The scope is broader than networks, `datasets` is the convention people and agents guess, and old backlinks are few because the SPA soft-404'd everything.
- **`/refs` → `/courses/`**, with the foreign courses in `/courses/#international`.
- **`/booklet` → `/about/#booklet`**, with the PDFs re-hosted under `/files/` or linked as labelled archived copies.
- **`/tools` → the GitHub Network-Code-Repository**, which exists (last push 2019).
- **`/stat1021/` is kept** as an archived page with all its 2018 links (D12).
- Angular `redirectTo` routes stay for client-side navigation. The CloudFront Function serves the real 301s.
- Visual design: system fonts (PingFang TC, Noto Sans TC, Microsoft JhengHei), weights 400/700, line height 1.75, 「」 quotes, no web fonts. Tables become cards on phones while keeping table semantics.

### D7. Machine access
- **Do now:**
  - real HTTP semantics (D2);
  - a prerendered page and a JSON record per item;
  - the static `/api/v1/` (manifest, lists, records, CSV, taxonomy, catalog, JSON Schemas; metadata under CC0 1.0);
  - a Markdown `index.md` sibling per record page (Claude Code, Cursor and OpenCode request Markdown);
  - schema.org JSON-LD whose facts are also visible text;
  - a `sitemap.xml` with true `lastmod`;
  - `llms.txt` (cheap: Claude Code fetches it, though Google ignores it);
  - Search Console and Bing Webmaster Tools via Route 53 TXT records, and an IndexNow ping on deploy.
- **robots.txt:** allow everyone, list `Sitemap:`, and do **not** disallow `/search/`, so crawlers can see its `noindex`. The crawler allow-list in the agent-access spec is the single list. Keep Google-Extended allowed; blocking it also removes the site from Gemini-app grounding. AI-training crawlers are allowed (Q4): models then learn the site exists and suggest it even without searching.
- **Skip:** RFC 9727 api-catalog, MCP server cards and ai-catalog.json (no client reads them yet), NLWeb, agents.json, ai-plugin.json, A2A cards, WebMCP, OpenAPI (optional later, generated from the schemas).
- Keep pages lean. Claude Code's WebFetch reads 100k characters, so inline critical CSS and the transfer-state script must not push content out; task 5.5 checks this.

### D8. Curation pipeline (minimum for hosting own copies)
- **Location:** `curation/` in this repo, Python pinned with uv: networkx 3.7, igraph 1.0, xgi 1.0, and frictionless. graph-tool is optional because pip cannot install it. Recipes live in `curation/recipes/<id>.yaml`. A monorepo keeps record, recipe and manifest in one PR; it can be split later.
- **In this change:**
  - fetch (`get`/`api`/`git`/`manual`; no form automation);
  - landing-page capture through Internet Archive Save Page Now;
  - license-class enforcement;
  - converters **only for kinds being hosted at launch** (graph and hypergraph);
  - stats; SHA-256 manifest, `SHA256SUMS`, a zip of all files, provenance, and a bilingual `ATTRIBUTION.txt`;
  - an approval-gated upload job;
  - one monthly health workflow (re-hash, upstream change, link check → one issue). GitHub disables schedules after 60 idle days; the monthly site rebuild (course freshness) keeps the repo active.
- **Versions:** semver with the Croissant 1.1 meaning; release and snapshot dates stored separately. *Rejected:* integers (no compatibility signal) and `YYYY-MM-DD` (conflates snapshot date with release identity).
- **Formats:**
  - graphs: csv-bundle + Frictionless `datapackage.json` + GraphML;
  - hypergraphs and simplicial complexes: HIF;
  - rankings: PrefLib; pairwise comparisons: a comparisons CSV (built when first needed);
  - GML and Parquet: optional.
  
  Text files are pre-compressed, because CloudFront compresses only 1 KB–10 MB.
- **Discovery in this change** is manual: a short list of saved searches (data.gov.tw, depositar, Zenodo, OpenAlex, Google Dataset Search) that the maintainer runs each quarter. Automated harvesters and AI triage come in `add-archive-and-outreach`. Their guardrails are already fixed by the data-curation spec's human gate:
  - candidates only, with a verbatim license quote, and the class computed in code;
  - no credentials and no contact data for the agent;
  - candidate files hold DOIs and URLs, never researchers' names.

### D9. MCP server: a separate later change (Q7)
- **Why not now:**
  - `/api/v1/` already serves every agent that can fetch.
  - MCP would be the site's first runtime service.
  - With few datasets it adds little.
  - The ground is moving: the MCP spec went stateless on 2026-07-28, and the official registry is still in preview (API v0.1).
- **Locked in now:** stable ids, versioned `/api/v1/` with JSON Schemas, `catalog.json` plus the shared search core, license, download and citation fields, real 404s (the registry's HTTP checks fail on soft 404s), and the reserved `/mcp`.
- **Sketch of `add-mcp-server`** (about 3–4 days, then 1–2 h/month):
  - Five read-only tools, each with `title` and `readOnlyHint`:
    - `search` and `fetch` (ChatGPT-compatible);
    - `search_datasets`;
    - `search_courses`;
    - `list_facets`.
  - Records byte-identical to `/api/v1`.
  - Hosting: Cloudflare Workers Free with the stateless `createMcpHandler` (a hard cap of 100k requests/day, so abuse means an outage, not a bill), fronted at `https://netscied.tw/mcp`.
  - Registry: `tw.netscied/taiwan-network-data` via **DNS verification**, added as a third value of the apex TXT record set, then submitted to the Claude directory.
- **Trigger:** about 15–20 real datasets, a wish for directory presence, or logs showing agents pulling `/api/v1`.

### D10. Researcher registry (Q1)
- **Split:**
  - Bibliographic credit (names as published) always appears.
  - Consented person credit (affiliation, ORCID, homepage, role) appears on dataset pages only.
  - There are no profile pages in this change.
- **Private log:** a private GitHub repo `netscied-people` with hand-edited YAML (people, permissions, consents) and small evidence files. It has no Actions and no third-party apps; access is by 2FA/passkey. Encrypted backups (`git bundle | age`) are kept on the maintainer's own storage, rotated so none is older than 3 months; the age key is offline in two places.
  - GitHub stores data in the US, and the notice says so.
  - This change needs no export script: public person records are hand-edited through a PR, and CI enforces the allowlist and the PII scan.
- **States are kept small:** `contacted` → `consented` / `declined` / `no_response` / `do_not_contact`. The fuller state machine in research.md is for later.
- *Rejected:*
  - an encrypted file in the public repo (field names stay readable, and the ciphertext is public forever);
  - Airtable (1,000 API calls/month);
  - Notion and Sheets (weak structure, sharing mistakes).
- **PDPA:**
  - The maintainer is a 非公務機關, and the household exemption does not apply.
  - Collecting emails from university pages is collection under 第19條第1項第3/7款, so the first outreach carries the 第9條 notice (template in research.md).
  - Deadlines: 15 days for access, 30 days for correction or deletion.
  - Retention: contact details 24 months after the last unanswered contact; consent evidence while the data is public plus 5 years.
  - The 2025-11-11 amendment has no effective date, and the PDPC is not yet established (as of 2026-11). Re-check before launch.
- **Q1 "public"** can only mean consented public credit. A public log of who was contacted, or of contact details, is excluded by law and by this design.

### D11. Courses (Q8)
- **Inclusion:** network science, social network analysis, graph theory and graph ML, each marked `core` or `partial` (a unit of 3+ weeks).
  - Computer networking and the internet-as-medium are excluded, and rejected candidates are listed with reasons.
  - Title precision for 網路 is only about 1–6% (網絡 about 60%), so every course is curated by hand.
- **Collection in this change:** hand-seeded (at least 15), then a per-semester watchlist re-check in late Jul–Aug and late Jan–Feb, plus instructor submissions.
  - The ISAC open-data CSV and the official exports of NTHU, NCCU, NTU, NYCU and NTNU are checked by hand. The empty course search links to 大學校院課程資源網 at `https://course-tvc.yuntech.edu.tw/WebU/index.aspx` (the old `ucourse-tvc` host is dead).
  - The discovery script is deferred.
  - The site is rebuilt monthly so freshness labels follow the calendar.
- **Display:** terms as `114-1（2025 秋）`; labels 本學期開課 / 最近開課 / 近年未開課 / 歷史紀錄; links to syllabi, never copies.

### D12. Governance and specific datasets
- **Rules:** personal-data levels, takedown and channels are in the content-governance spec. The license class (D3) and the personal-data level combine, and the personal-data level always wins.
- **Takedown:** a 7-day acknowledgement (an auto-reply on hi@netscied.tw); downloads suspended within 3 days on a credible personal-data complaint; a decision within 30 days (+30); tombstones. Precedents: Netzschleuder `restricted`, Zenodo tombstones, Common Crawl opt-out.
- **Channels** (Q5):
  - a Google Form (no account needed) for data requests and suggestions, prefilled from empty searches. Google processes the submissions, and the privacy notice says so. Email is optional on the form;
  - GitHub Issue Forms (推薦資料集, 徵求資料集, 回報問題; still "public preview");
  - email, the only channel for takedowns and permission letters.
- **金馬獎 2018:** level `public-role`. The nominees were publicly announced in professional roles; collection falls under 第19條第1項第3/7款, and notification is waived under 第9條第2項第2款.
  - Its provenance and license are unknown. Unless the owner confirms rights, **rebuild it from the official nominee announcement** as the site's own compilation (`own-work`, CC BY 4.0). That gives one hosted dataset cheaply.
  - It is retitled 「第55屆金馬獎入圍者–電影網絡」, because it covers every nominee role.
- **TWNIC:** `link-only` to map.twnic.tw until written permission arrives.
- **`/stat1021`:** the archived page keeps every 2018 link, including the class questionnaire, its data and the `junipertcy/networkie` repository. Owner decision (2026-11-04): the class data was published with the participants' consent, and it stays linked and unchanged; the 2018 class files in `public/` are kept. The Clauset-derived slides link to Clauset's original instead of being re-hosted. The `networkie` repository is outside this change and is not modified.

### D13. Phasing, follow-up changes, and the hours budget
- **Phase 0a, close the bucket** (about 3–5 h): OAC, REST origin, the old error mapping kept, Block Public Access, Budgets.
- **Phase 0b, HTTP semantics** (about 8–12 h): ships with the first deploy of the existing rebuild. The Function and its tests, the `/404/` route and error responses, robots.txt and sitemap, `www` → apex, the flat-rate plan and its WAF check.
- **Phase 1, MVP redesign** (about 135–210 h):
  - content model and validation (20–30 h), test tooling (4–8), pages and a11y (35–50), search and gold set (20–30), machine access and news (8–12), minimum curation pipeline (25–40), seed content (25–40);
  - **launch bar:** at least 8 published datasets, at least 3 of them hosted (for example 金馬獎 rebuilt as own work; the 立法院 co-sponsorship hypergraph from LYAPI under CC BY 4.0; a monthly aggregate of Taipei MRT OD flows under OGDL); 7 wanted entries; at least 15 Taiwan courses.
- **Total for this change:** about 150–225 h, roughly 4–7 months at 8 h/week. Phase 0 delivers most of the crawler and agent benefit in a weekend.
- **Steady state after launch:**

  | Recurring item | h/month |
  |---|---|
  | Course refresh (8–12 h per semester) | 1.5–2 |
  | Monthly health issue triage, including the occasional version cut | 1–2 |
  | Dependency and security updates | 1 |
  | Requests, wanted counts, takedowns | 0.5 |
  | Gold-set upkeep | 0.5 |
  | **Operations total** | **≈ 4.5–6** |
  | New content (optional pace) | link-only record 0.5–1 h each; hosted 2–4 h each |

- **Follow-up changes, each with a trigger:**
  - `add-archive-and-outreach`: Zenodo community deposits with DOIs for the first release and each MAJOR version (Q3), RO-Crate and DataCite metadata, structured outreach, discovery harvesters and AI triage with the guardrails in D8, form fetches, the course discovery script. Trigger: the first outreach permission, or the first file over the per-file ceiling.
  - `add-mcp-server`: see D9.
  - `add-search-endpoint`: see D4.
  - `add-english-site`, and researcher profile or directory pages: on demand.

## Risks / Trade-offs

- [The search looks empty with few datasets] → Honest counts, a wanted list, prefilled requests and external catalogs, the launch bar, and example queries that are dropped if they would return nothing.
- [Flat-rate eligibility or terms change; AWS may throttle sustained excess; data and HTML share one allowance (1M requests on Free, versus 10M under pay-as-you-go always-free)] → Confirm eligibility in Phase 0a; per-file ceiling and WAF rate rule; upgrade to Pro at the stated thresholds; the Cloudflare flip is documented.
- [A plan-gated feature (custom error responses, the WAF rate rule) turns out unavailable on Free] → Task 2.6 checks before cut-over. Fallbacks: grant `s3:ListBucket` to the OAC so missing keys return a real 404 (S3's XML body), or stay on pay-as-you-go with the per-file ceiling and the Budgets alert until Pro.
- [The CloudFront Function or the origin switch breaks old links] → Phase 0a/0b split, a Function that fails open, full redirect-table tests, and post-deploy `curl` smoke checks; rollback configs saved first.
- [Legal positions are assumptions; PDPA amendments may take effect] → Default to link-only when unsure; a short legal review before hosting anything above `public-role`; re-check the PDPA status before launch and yearly.
- [Over-aliasing creates false positives] → Forbidden lists in the gold set; aliases kept granular.
- [IME edge cases on Android Gboard Zhuyin and older iOS Safari] → Native form submit in v1; real-device tests before launch.
- [Bus factor of one] → Everything is in git; succession and key-recovery notes in the private repo; a co-curator for the Zenodo community when the archive change lands.
- [Fragile upstream portals (token forms, anti-bot walls, US-IP timeouts)] → Manual recipes with recorded hashes; fetch from Taiwan when needed.
- [Personal data leaks into the public repo, where git history makes it permanent] → Allowlist schemas, CI PII scan, and a private log outside every public system.

## Migration Plan

1. **Pre-checks (owner, console):** confirm flat-rate eligibility, and save the current distribution and bucket-website configs to `infra/rollback/`.
2. **Phase 0a:** create the OAC and the bucket policy. Switch the origin to REST+OAC, keeping the current error mapping. Verify that the site still serves, then turn on Block Public Access. Verify that the S3 endpoints return 403 or 404.
3. **Phase 0b:**
   - Publish the Function, tested against the redirect table. In Phase 0b the map holds only host and slash rules; the old pages keep serving the rebuild.
   - Deploy the prerendered rebuild (assets first).
   - Replace the error responses (403/404 → `/404/index.html`, 404) and invalidate.
   - Subscribe to the plan and check the WAF against the allowed crawler user agents.
   - Verify: `/nope` → 404; `/networks` → 301 `/networks/` → 200; `/robots.txt` is `text/plain`; www → apex.
4. **Phase 1:** develop on a branch; deploy when the launch bar is met. Turn on the legacy 301s in the same deploy, add the relaunch news, and submit the sitemap to Search Console and Bing.
5. **Rollback:** restore the saved distribution config and re-sync the previous build. S3 versioning keeps the old objects for 30 days.

## Decisions record (2026-11-04)

The owner chose the architect's recommended option on every question.

| # | Question | Decision | Where it is reflected |
|---|---|---|---|
| Q1 | Researcher log: public, private or split? | **Split.** Consented public credit on dataset pages. Contacts, outreach, permissions and notes in a private GitHub repo. | D10; researcher-registry spec; tasks 9.x |
| Q2 | How to pay for serving self-hosted data | **Stay on AWS, CloudFront flat-rate plan** (Free now, Pro later), private buckets, per-file size limits (100 MB on Free, 2 GB on Pro). | D2; site-hosting spec; tasks 1.x, 2.6, 8.6 |
| Q3 | Where citable DOIs come from | **A Zenodo community**, depositing the first release and each MAJOR version, in the follow-up change `add-archive-and-outreach`. | D13 follow-ups; data-curation spec (DOI recorded once minted) |
| Q4 | AI-training crawlers | **Allow.** | D7; agent-access spec; task 2.2 |
| Q5 | Public request and contribution channels | **Google Form + GitHub Issue Forms + email** (email is the only channel for takedowns and permission letters). | D12; content-governance spec; task 3.7 |
| Q6 | How much English | **Mandarin UI, an English abstract on every dataset and course page, English queries accepted; no English mirror.** | D5; site-structure and site-search specs |
| Q7 | MCP server timing | **Later, as a separate change** (`add-mcp-server`). This change keeps the static JSON API and reserves `/mcp`. | D9; agent-access spec |
| Q8 | Course scope | **Four categories** (network science, social network analysis, graph theory, graph ML), with `partial` for a network unit of 3+ weeks. | D11; course-catalog spec |

### Answers of 2026-11-04 to the Milestone A questions

| # | Question | Decision | Where it is reflected |
|---|---|---|---|
| A1 | LYAPI states its license only as a footer link "CC-BY-4.0" (and `license: cc-by-4.0` on Hugging Face). Host the co-sponsorship hypergraph? | **Host it under CC BY 4.0, with attribution.** LYAPI and 歐噴有限公司 (OpenFun) are credited in `ATTRIBUTION.txt` and on the dataset page. Hosting does not wait on contacting OpenFun. | `ly-bill-cosponsorship-10th`; tasks 4.4, 8.x |
| A2 | Golden Horse 2018 modelling | **Keep as modelled:** Best Feature Film is film-only (no person edges); Best Original Film Song counts lyricist, composer and singer as nominees. | `golden-horse-2018-nominations`; task 4.1 |
| A3 | Booklet and STAT1021 PDFs (O2) | **Link labelled archived copies** (Internet Archive) where they exist; the owner may replace them with the original files later. | `/about/#booklet`, `/stat1021/`; task 4.7 |
| A4 | Course facts that could not be confirmed from outside Taiwan | **Publish only what is confirmed.** An unconfirmed fact is left blank or marked unverified, with the date it was checked; never guessed. Applies to three NCKU offerings read only through a third-party fetcher, the NYCU languages of instruction, and the TIGP 社群網路 115-1 instructor (NCCU lists 鄧雅文, TIGP 陳宜欣). | course schema `unverified` markers; course-catalog spec; task 4.5 |
| A5 | The no-account request form (Q5) | **The owner creates the Google Form later**; the site keeps a placeholder until its URL is provided. | `src/app/site.ts`; task 3.7 |

## Open items for the owner

These do not block implementation. The design proceeds on the stated default; each row says what changes if the answer differs.

| # | Item | Default used | If the answer differs |
|---|---|---|---|
| O1 | **Settled 2026-11-04 (default applied; A2):** provenance and license of `dataset/relations.json` (金馬獎 2018, apparently from jinma.today, "© 2016 Jinma") | Rebuild the network from the official nominee announcement as the site's own compilation (`own-work`, CC BY 4.0), level `public-role` (task 4.1) | If the owner holds rights, or jinma.today grants them, release the existing JSON under the chosen license (`own-work` or `written-permission`), and skip the rebuild. If rights are refused, publish it `link-only` to jinma.today, and the launch bar's third hosted dataset comes from the seed list (task 4.4). |
| O2 | **Settled 2026-11-04 (A3: archived copies):** do copies exist of the 《網絡素養》 Mandarin and English PDFs and of the three STAT1021 PDFs (homework 3, homework 6, syllabus)? | Link to labelled archived copies where found; otherwise list the item without a download link (task 4.7) | If the files exist, re-host them under `/files/` and link them directly. The in-class network file is never re-hosted. |
| O3 | Is `www.netscied.tw` used anywhere? | 301 from `www` to the apex (site-structure spec; task 2.3) | If something depends on `www` serving content, keep the 301 (it preserves path and query) and add a note; only an integration needing non-redirected responses would require a separate behavior. |
| O4 | Does the AWS account show as "using AWS Free Tier"? | Not on the Free Tier, so eligible for flat-rate plans (task 1.1) | If ineligible: run pay-as-you-go with the Budgets alert, and treat the 100 MB per-file ceiling and the WAF rate rule as the cost caps until the account becomes eligible. If the account never becomes eligible, apply the Cloudflare flip criteria in D2. |
| O5 | Defaults the architect set without asking: catalog at `/datasets/` (301 from `/networks`); `/tools` → 301 to the GitHub Network-Code-Repository; `/stat1021/` kept as an archive page; data bucket in AWS Taipei (ap-east-2); English title required on every published dataset | As listed | `/networks/` as the catalog path: swap the path in the site-structure spec, the redirect map and the dataset URLs (no other change). `/tools` as 410 or a tombstone: one row of the redirect map. `/stat1021` folded into its course record: add a redirect row. Seoul for the data bucket: storage is ~10% dearer and the data stays outside Taiwan. English title optional: relax one schema rule; English search recall drops for those records. |

**Decided (2026-11-04):** `/stat1021/` keeps its links to the 2018 class questionnaire, its data and the `junipertcy/networkie` repository. The owner confirmed that the participants consented to their publication; this change neither alters nor comments on that material.
