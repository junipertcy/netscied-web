## Purpose

Defines the machine-readable surface of netscied.tw so that AI agents, crawlers and programs can discover, filter, download and cite Taiwan network datasets and courses without running the site's JavaScript, and so that a later MCP server can be a thin layer over the same data.

## ADDED Requirements

### Requirement: Versioned static JSON API with stable identifiers
The site SHALL publish a read-only static JSON API under `/api/v1/` consisting of: `index.json` (a manifest with record counts, the last update time, the metadata license, which SHALL be CC0 1.0, and links to every file below); `datasets.json` and `datasets.csv` (all published dataset records in summary form); `datasets/<id>.json` (one full dataset record); `courses.json`, `courses.csv` and `courses/<id>.json` (the same for courses); `wanted.json`; `taxonomy.json` (every controlled vocabulary with Mandarin and English labels); `catalog.json` (the exact file the browser search uses); and `schema/<name>.schema.json` (the JSON Schemas that records validate against). Record identifiers SHALL be the permanent ASCII slugs used in page URLs, SHALL never be reused, and a withdrawn record SHALL remain at its URL with `"status": "withdrawn"` and a reason instead of disappearing. Backward-incompatible changes to the response shapes SHALL be published under a new version prefix while `/api/v1/` keeps working.

#### Scenario: Agent lists datasets
- **WHEN** an agent fetches `/api/v1/datasets.json`
- **THEN** it receives a JSON array with one entry per published dataset, each including `id`, Mandarin and English titles, structure kind, license identifier, latest version, and the URL of its full record

#### Scenario: Withdrawn record
- **WHEN** a dataset is withdrawn after a takedown request
- **THEN** `/api/v1/datasets/<id>.json` still returns a record with `"status": "withdrawn"`, the withdrawal date and a reason, and no download URLs

#### Scenario: Suspended files
- **WHEN** downloads of a version are suspended pending a takedown review
- **THEN** the record marks that version `"suspended": true` and lists no download URLs or checksums for it, so agents never receive URLs that return 404

#### Scenario: Page and JSON agree
- **WHEN** the build finishes
- **THEN** every field shown on a dataset detail page is derived from the same record that is published at `/api/v1/datasets/<id>.json`

### Requirement: Every record is directly usable by an agent
Each full dataset record in the API SHALL include: canonical page URL; license as an SPDX identifier or a documented site-defined identifier, with a license URL; attribution text; a ready citation string and BibTeX; for hosted data, the direct download URL, format, byte size and SHA-256 of every file of the latest version and of every earlier version; for link-only data, the upstream landing URL and the upstream license statement; and the persistent identifier (DOI) of the dataset and of each version, whenever one exists. Download URLs SHALL be plain HTTPS URLs that return the file without JavaScript, redirects through other hosts, or authentication.

#### Scenario: Agent downloads and verifies
- **WHEN** an agent reads a hosted dataset record and downloads its GraphML file
- **THEN** the SHA-256 of the downloaded bytes equals the checksum in the record

#### Scenario: Link-only record
- **WHEN** a record's data may not be redistributed
- **THEN** the record has no download URLs on netscied.tw and instead gives the upstream landing URL and its license statement

### Requirement: Each page has a machine-readable sibling
Each dataset and course detail page SHALL link to its JSON record with `<link rel="alternate" type="application/json">`, and SHALL have a Markdown rendering at the same path with `index.md` (for example `/datasets/<slug>/index.md`) that contains the same facts as the page without site chrome, linked visibly from the page body. The catalog pages `/datasets/` and `/courses/` SHALL link to their JSON and CSV equivalents.

#### Scenario: Markdown sibling
- **WHEN** an agent fetches `/datasets/<slug>/index.md`
- **THEN** it receives Markdown containing the title, description, structure, size, license, citation and download table of that dataset

### Requirement: Structured data for search engines
Each dataset detail page SHALL embed schema.org `Dataset` JSON-LD including at least `name`, `description`, `url`, `identifier` (DOI when present), `version`, `license`, `creator`, `isAccessibleForFree`, `spatialCoverage`, `temporalCoverage` when known, `keywords`, `includedInDataCatalog`, and one `DataDownload` per hosted file with `contentUrl`, `encodingFormat` and `contentSize`. The `/datasets/` page SHALL embed a schema.org `DataCatalog`. Each course detail page SHALL embed schema.org `Course` JSON-LD with a `CourseInstance` per known offering. Every page except the home and not-found pages SHALL embed `BreadcrumbList` JSON-LD. Every fact in JSON-LD SHALL also appear as visible text on the page. Wanted entries SHALL NOT carry `Dataset` markup.

#### Scenario: Dataset Search eligibility
- **WHEN** a dataset detail page is checked with a schema.org validator
- **THEN** it reports a valid `Dataset` with no missing required properties for Google Dataset Search

#### Scenario: No hidden facts
- **WHEN** the JSON-LD of a page states a license
- **THEN** the same license is shown as visible text on that page

### Requirement: Crawl policy and sitemap
`/robots.txt` SHALL allow all search-indexing crawlers and user-triggered AI fetchers (at least Googlebot, Bingbot, OAI-SearchBot, ChatGPT-User, Claude-SearchBot, Claude-User, PerplexityBot, Perplexity-User, Applebot, DuckAssistBot, Amzn-SearchBot, Meta-WebIndexer) and Google-Extended, SHALL reference `/sitemap.xml`, and SHALL express the owner's chosen policy on AI-training crawlers. It SHALL NOT disallow `/search/`, so that crawlers can see that page's `noindex`. Any firewall rules on the CDN SHALL NOT block these crawlers. `/sitemap.xml` SHALL list every indexable page with a `lastmod` equal to the last change of the underlying record or page, and SHALL exclude `/search/` and the not-found page.

#### Scenario: Search crawler allowed
- **WHEN** OAI-SearchBot evaluates `/robots.txt` for `/datasets/`
- **THEN** the path is allowed, and a request with that user agent to `/datasets/` returns 200 rather than a firewall challenge

#### Scenario: Accurate lastmod
- **WHEN** a dataset record is updated and the site is rebuilt
- **THEN** the sitemap entry for that dataset's page carries the record's update date and other entries are unchanged

### Requirement: llms.txt guide for agents
The site SHALL publish `/llms.txt` in Markdown, generated at build time, describing in Mandarin and English what the site contains, the URL patterns of pages, the JSON API entry points and field meanings, how to filter the catalog for common needs (for example by structure kind or domain), the license of the metadata, and how to cite datasets.

#### Scenario: Agent orientation
- **WHEN** an agent fetches `/llms.txt`
- **THEN** it finds the URL of `/api/v1/index.json` and an explanation of how dataset records express structure kind and license

### Requirement: Machine access is stable enough to build on
The API manifest SHALL state the API version and the date of the last backward-incompatible change. The `/mcp` path SHALL be reserved for a future MCP endpoint and SHALL return 404 until a later change defines it. The site SHALL NOT serve any `/.well-known/` file that it does not intend to support.

#### Scenario: Reserved MCP path
- **WHEN** a client requests `/mcp` before an MCP server exists
- **THEN** the response status is 404
