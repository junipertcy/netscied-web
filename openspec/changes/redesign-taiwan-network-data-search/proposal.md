> **Summary:** Redesign netscied.tw as a Mandarin-first search engine for Taiwan network data and network courses, navigable by AI agents, with self-hosted dataset copies.
>
> **Status:** ready for implementation. The owner's decisions of 2026-11-04 are recorded in design.md § Decisions record; the factual items still open are in design.md § Open items for the owner.

## Why

netscied.tw today is a 2018-era brochure: a long essay, a hand-written list with 2 real datasets among many 「搜集中…」 placeholders, a software list, and mostly non-Taiwan course links. The live deployment answers every URL with the home page and status 200, and its storage bucket is publicly readable, so crawlers and AI agents cannot tell what exists.

The owner wants the site to become **the place Taiwanese citizens, and the AI agents they use, go to find network data about Taiwan**: graphs, hypergraphs, simplicial complexes, rankings and other relational data collected in Taiwan or describing Taiwanese entities, plus network courses offered at Taiwanese universities. Such data is almost absent from the US/EU catalogs (Netzschleuder, ICON, SNAP, KONECT). It sits with Taiwanese researchers and on Taiwanese open-data portals, so the site has to find it, keep its own copies, and credit the people who collected it. The data is scarce today, so the infrastructure has to be right before the collection grows.

## What Changes

- **Search-first home.** `/` becomes one Mandarin-first search bar with a 資料/課程 toggle, an honest count line, and the latest news. The long essay goes; its core moves to `/about/`. **BREAKING** for anyone relying on the essay at `/`.
- **Client-side Mandarin search over a static catalog.** Character-bigram matching with Traditional/Simplified, 臺/台 and 網絡/網路 folding, a curated bilingual concept/alias table, IME-safe input, the query in the URL, an empty state that captures demand, and a CI gold-query gate. There is no search server in this change.
- **Dataset catalog with self-hosted copies.** One YAML record per dataset, validated by JSON Schema at build time. It covers structure kinds (graph, hypergraph, simplicial complex, ranking/pairwise, multilayer), properties, counts, license and redistribution basis, Taiwan-relevance basis, personal-data level, provenance and bilingual text. There is a table page `/datasets/`, detail pages `/datasets/<id>/`, and a wanted-data list `/wanted/` seeded from the old placeholders.
- **Minimum curation pipeline.**
  - Reproducible fetch recipes, and evidence of the original source (redistributable originals kept byte-for-byte; landing pages captured in the Internet Archive).
  - License classes that decide what may be re-hosted versus linked, and conversion to canonical formats (CSV bundle + GraphML for graphs, HIF for hypergraphs).
  - Computed statistics, SHA-256 manifests, immutable **semantic versions**, provenance and attribution files.
  - An approval-gated upload, and one monthly health check.
- **Researcher credit, split public/private.** Names as published are always shown. Consented credit appears on dataset pages. Contact details, outreach history, permission evidence and notes live in a private repository outside every public system, as 個人資料保護法 requires.
- **Course catalog.** Taiwan-only course records with nested semester offerings (`114-1` terms), explicit inclusion rules (network science, social network analysis, graph theory, graph ML; `partial` for a network unit of 3+ weeks) that exclude computer networking, freshness labels, a table page `/courses/` and detail pages. The foreign courses from `/refs` move to an international section outside search.
- **Machine access.** A versioned static JSON API `/api/v1/` with stable ids and CC0 metadata; a Markdown sibling for each record page; schema.org `Dataset`/`DataCatalog`/`Course` JSON-LD; a real `robots.txt` that also admits AI-training crawlers, and a `sitemap.xml`; `llms.txt`. `/mcp` is reserved.
- **News as data.** News lives in data files, with the latest 3 items on home, an archive at `/news/`, and an Atom feed. First publication of a dataset generates a news item.
- **Governance.**
  - A personal-data level on every dataset decides hosting.
  - A takedown and correction procedure, a privacy notice and a disclaimer.
  - Request and contribution channels: a Google Form (no account needed), GitHub Issue Forms, and email.
  - The archived `/stat1021/` page is kept with its 2018 links, including the class data its participants consented to publish (owner decision, 2026-11-04).
- **IA and legacy URLs.**
  - Navigation becomes 資料集 · 課程 · 消息 · 關於.
  - 301s: `/networks` → `/datasets/`, `/refs` → `/courses/`, `/booklet` → `/about/#booklet`, `/tools` → the GitHub Network-Code-Repository. `/stat1021/` is kept as an archive.
  - URLs end in a trailing slash, `www` is canonicalized, and missing pages return real 404s.
  - Mandarin pages with an English abstract on every dataset and course page; search accepts English; no English mirror.
  - **BREAKING:** the `/tools` and `/booklet` pages are removed; their URLs redirect.
- **Hosting hardening (an explicit decision, design.md D2):**
  - Stay on AWS, and close the publicly readable bucket with Origin Access Control.
  - One fail-open CloudFront Function for redirects and index resolution; real 404s; safe deploy ordering.
  - A private data bucket under `/data/`.
  - The CloudFront flat-rate plan, so the bill has no egress overage; a WAF rate rule on `/data/*`; a per-file ceiling of 100 MB on the Free plan.

## Capabilities

### New Capabilities
- `site-structure`: page set, navigation, home, about, news and feed, URL conventions, legacy redirects, the archived page without personal data, not-found behavior, Mandarin-first language, pages complete without JavaScript.
- `site-hosting`: private origin, content types, fail-open edge logic, safe deploys, immutable data paths, caching, bounded monthly cost with a per-file ceiling and rate limit, minimal disclosed logging.
- `site-search`: the search form and toggle, IME safety, Mandarin/English/Simplified query understanding, the 網路 ambiguity, ranking and presentation, edge-case queries, empty states, the static payload budget, no-JS behavior, and the quality gate.
- `dataset-catalog`: dataset records and validation, the required core, structure vocabulary, domains, licensing versus redistribution, Taiwan relevance, permanent identifiers, the table, detail and wanted pages.
- `data-curation`: the human gate, fetch recipes, source evidence, license classes, canonical formats, statistics, integrity and the monthly health check, semantic versions, provenance, attribution and reproducibility.
- `researcher-registry`: two layers of credit, allowlisted public person records, the private log outside public systems, reviewed credit changes, the first-contact notice and consent, rights requests and retention.
- `course-catalog`: course and offering records, inclusion rules, Taiwan scope and the international section, the table and detail pages with freshness, collection that respects university terms, the semester refresh.
- `agent-access`: the static JSON API, agent-usable records, Markdown siblings, JSON-LD, crawl policy and sitemap, llms.txt, API stability and the reserved `/mcp`.
- `content-governance`: personal-data levels, pseudonymisation, takedown and correction, third-party terms, contribution and request channels, the privacy notice.

### Modified Capabilities
None. The repository has no existing specs; `openspec/` was initialized for this change.

## Impact

- **Code:**
  - `src/app/pages/*` are rewritten. Removed: `tools`, `booklet`, and the essay in `home`. New: `search`, `datasets`, `dataset-detail`, `wanted`, `courses`, `course-detail`, `news`, `about`, and `not-found` (prerendered at `/404/`). `stat1021` keeps its content under an archive banner.
  - `app.routes.ts` and `app.routes.server.ts` gain parameterized prerender routes from the catalog.
  - New build scripts: catalog validation and build, search index, API, sitemap, feed, llms.txt, search evaluation.
- **New repository folders:**
  - `catalog/`: dataset and course records, version manifests, consented public person records, vocabularies including the search concept table, `ids.lock`, the gold query set.
  - `content/news/`.
  - `config/`: `redirects.yaml`.
  - `schemas/v1/`.
  - `search/`: the shared TypeScript search core.
  - `infra/`: the CloudFront Function with its tests, and rollback configs.
  - `curation/`: Python pinned with uv. It runs in CI for small fetches and conversions, and on the maintainer's laptop for manual work.
- `angular.json` is not touched in authoring this proposal.
- **Dependencies:**
  - Runtime: `minisearch`.
  - Build and test: `ajv`, `ajv-formats`, `yaml`, OpenCC tables (used at build time only, to generate a small fold map), a unit test runner, Playwright, axe-core.
  - Curation: Python with networkx, xgi, frictionless and pyyaml via uv.
  - No new runtime services.
- **Infrastructure (one-time, manual):**
  - S3 Block Public Access and OAC on the existing `netscied.tw` bucket; a new private `netscied-data` bucket.
  - One CloudFront Function; new error responses (403/404 → `/404/index.html` with status 404, replacing index.html with 200); response-header policies (CORS for `/data/*` and `/api/*`).
  - The flat-rate plan (Free now, Pro later) with a WAF rate rule; an AWS Budgets alert; lifecycle rules.
  - Google Search Console and Bing Webmaster Tools verification through Route 53 TXT records.
  - A private GitHub repository for the researcher log.
- **People and process:** about 150–225 hours to build, then about 4.5–6 hours a month of operations (design.md D13).
- **Out of scope; follow-up changes with triggers in design.md D13:**
  - `add-archive-and-outreach`: Zenodo community deposits with DOIs for the first release and each MAJOR version, structured outreach, discovery harvesters and AI triage, form fetches, the course discovery script.
  - `add-mcp-server`, triggered at about 15–20 real datasets or clear demand.
  - `add-search-endpoint`, including semantic search.
  - An English site; researcher profile pages.
