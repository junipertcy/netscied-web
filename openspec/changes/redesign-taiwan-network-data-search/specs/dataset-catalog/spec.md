## Purpose

Defines the dataset record that is the single source of truth for every Taiwan network dataset on the site, the controlled vocabularies that make datasets searchable and comparable across graphs, hypergraphs, simplicial complexes, rankings and other relational data, and the catalog, detail and wanted-data pages built from those records.

## ADDED Requirements

### Requirement: One validated record per dataset
Each dataset, including requested-but-not-yet-collected ("wanted") and withdrawn datasets, SHALL be described by exactly one human-edited YAML file whose name equals its identifier, validated at build time against the published dataset JSON Schema (draft 2020-12). The build SHALL fail on any schema violation, on a duplicate identifier, or on a reference to an unknown person, vocabulary term or license. For datasets with hosted versions, counts, statistics, checksums and file sizes SHALL NOT be typed by hand; they SHALL come from machine-written, append-only version manifests. Record update dates SHALL come from the repository history. For link-only datasets, the curator MAY enter approximate counts, marked as approximate.

#### Scenario: Invalid record blocks the build
- **WHEN** a dataset file omits its Taiwan-relevance basis or uses an unknown domain identifier
- **THEN** the build fails and the error names the file and the field

#### Scenario: Computed fields are not hand-edited
- **WHEN** a curator writes a node count directly into a hosted dataset's YAML file
- **THEN** validation fails with a message that counts for hosted datasets come from the version manifest

### Requirement: Small required core
A record with status `published` SHALL contain: identifier; status; date added; Mandarin title and English title; a Mandarin description of at least 50 characters; what a node and what a link represent (in Mandarin); at least one structure kind, plus `directed` and `weighted` when a kind is graph; one to three domains; at least one Taiwan-relevance basis with a one-sentence justification; the upstream source name and URL; a license identifier; a redistribution basis; a personal-data level; and the date that level was reviewed. A record with status `wanted` SHALL require only identifier, status, date added, Mandarin title, a short Mandarin description, domains and the reason it is wanted. Missing recommended fields (for example English description, keywords, temporal and spatial coverage, creators, references) SHALL produce warnings, not failures.

#### Scenario: Minimal published record
- **WHEN** a curator writes a link-only record with exactly the required fields
- **THEN** the build succeeds, prints warnings for missing recommended fields, and publishes the record

#### Scenario: Wanted record
- **WHEN** a record has status `wanted` and only the wanted-level fields
- **THEN** the build succeeds and the record appears on `/wanted/` and nowhere in the dataset table

### Requirement: Structure vocabulary covers all relational data kinds
The record SHALL describe structure with a controlled list of kinds: `graph`, `hypergraph`, `simplicial-complex`, `cell-complex`, `ranking`, `pairwise-comparison`, `other-relational`. A dataset MAY list several kinds when it is offered in several representations, the first being its native one. Properties SHALL be separate typed fields, not tags: directed, weighted (with the weight's meaning and unit), signed, multi-edges, self-loops, number of partitions with partition names (bipartite and k-partite), layers (`single`, `multiplex`, `multilayer`), temporal form (`none`, `snapshots`, `event-times`, `intervals`, with resolution), spatial form (`none`, `node-coordinates`, `areal-units`, `edge-geometry`), and node and edge attributes. A ranking SHALL declare its data type (PrefLib `soc`, `soi`, `toc`, `toi`, `cat`); a pairwise comparison SHALL declare its outcome type and what direction means. Counts SHALL be recorded per kind (nodes, edges, hyperedges, layers, snapshots, alternatives, rankings, comparisons, and per partition), and MAY be marked approximate for external data.

#### Scenario: Bipartite network
- **WHEN** the 金馬獎 2018 film–person network is recorded
- **THEN** it has kind `graph`, `partitions: 2` named film and person, and counts for each partition

#### Scenario: Ranking without data type
- **WHEN** a record declares kind `ranking` without a ranking data type
- **THEN** validation fails

#### Scenario: Multilayer hypergraph
- **WHEN** a dataset is a hypergraph with one layer per legislative session
- **THEN** it is recorded as kind `hypergraph` with `layers: multilayer`, without needing a combined kind

### Requirement: Controlled bilingual domains
Every record SHALL carry one to three domains from a controlled list of nine, each with Mandarin and English labels: 社會關係 society, 政治與治理 politics, 文化、媒體與運動 culture, 經濟與產業 economy, 交通與移動 transport, 科技與基礎設施 technology, 資訊與知識 information, 生物與生態 life, 健康與醫療 health. Finer subjects SHALL be open tags with bilingual labels kept in a shared vocabulary file. Structural properties SHALL NOT be used as domains or tags.

#### Scenario: Old category preserved
- **WHEN** a dataset that the old site would have listed under 基礎建設 (roads or flights) is recorded
- **THEN** its domain is 交通與移動, shown in the 領域 column of `/datasets/` and as a filter value in the JSON API

### Requirement: Licensing is explicit and separate from redistribution
Every record SHALL state the upstream license as an SPDX identifier (for example `OGDL-Taiwan-1.0`, `CC-BY-4.0`), as `LicenseRef-<name>` with a name and URL for custom terms (for example the 立法院網站資料開放宣告), as `NOASSERTION` when unknown, or as `NONE` when all rights are reserved. Every record SHALL separately state a redistribution basis: `license-permits`, `written-permission` (with a reference to a private permission record), `own-work`, or `link-only`. Validation SHALL reject `license-permits` when the license is `NOASSERTION` or `NONE`, and SHALL reject hosted versions on a `link-only` record. Detail pages SHALL show both the license and whether the site may redistribute the data.

#### Scenario: Unknown license
- **WHEN** a record has license `NOASSERTION` and redistribution basis `license-permits`
- **THEN** validation fails

#### Scenario: TWNIC without license
- **WHEN** the TWNIC network has no stated license and no written permission
- **THEN** it is published as `link-only`, with a link to TWNIC's page and no hosted files

### Requirement: Taiwan relevance is declared
Every published dataset SHALL state at least one Taiwan-relevance basis from a controlled list: collected in Taiwan; describes Taiwanese entities (people, places, organisations, infrastructure or species in Taiwan); published by a Taiwanese institution or researcher; created by Taiwan-based researchers; or a Taiwan-specific subset of a larger dataset, with a note on how to extract it. It SHALL also give a one-sentence justification in Mandarin. Location metadata SHALL name Taiwan neutrally (「臺灣」/"Taiwan") and SHALL NOT inherit upstream labels that file Taiwanese data under another country.

#### Scenario: Missing basis
- **WHEN** a published dataset record lacks a Taiwan-relevance basis
- **THEN** the build fails

#### Scenario: Subset of a foreign catalog entry
- **WHEN** a Netzschleuder entry filed under "Chinese cities" contains the Taipei metro network
- **THEN** it can be recorded with basis `taiwan-subset`, spatial coverage 臺灣, and a note on how to extract the Taipei network

### Requirement: Permanent identifiers
Dataset identifiers SHALL be lowercase ASCII kebab-case slugs of 3 to 64 characters, chosen in English (Hanyu Pinyin for proper names without an official English form), and SHALL NOT encode structure kind, format or version. An identifier SHALL never change after first publication and SHALL never be reused; an append-only list of every identifier ever issued SHALL be checked by the build. A renamed record SHALL keep its old identifiers as aliases, and each alias SHALL redirect to the current page. A wanted record SHALL keep its identifier when it becomes published.

#### Scenario: Reuse prevented
- **WHEN** a new record uses an identifier that once belonged to a withdrawn dataset
- **THEN** the build fails

### Requirement: Dataset table page
`/datasets/` SHALL show a prerendered table of all published datasets with the caption 「本站收錄的台灣網絡資料集（共 N 筆）」 and these columns: 名稱 (Mandarin, with English below), 領域, 結構 (badges), 規模 (nodes and links, or the kind's equivalent), 時間範圍, 授權, 最新版本 (version and date, or 「外部連結」 for link-only data). The default order SHALL be the latest version date, newest first, using the date added for link-only datasets. The page SHALL link to `/wanted/` with the number of wanted entries, and to the JSON and CSV forms of the table.

#### Scenario: Link-only dataset in table
- **WHEN** a link-only dataset is listed
- **THEN** its 最新版本 cell reads 「外部連結」 and its row links to its detail page

### Requirement: Dataset detail page
Each published dataset SHALL have a page at `/datasets/<id>/` showing, in this order: the Mandarin and English titles; the description; a key-facts list (structure in words, size, temporal and spatial coverage, domains, latest version and release date, license, whether the site may redistribute, DOI); for hosted data a download table for the latest version giving the format, file, size and SHA-256 of every file, plus a link to the version's checksum manifest; how to cite (a formatted citation and BibTeX that use the version DOI when one exists and the version's page URL otherwise); the license and a copyable attribution text; the credited collectors and contributors who consented to be shown; the upstream source with the date the source snapshot was retrieved and the collection method; the version history with a change note and, when present, a DOI per version; a personal-data and takedown notice when the personal-data level is not `none`; and an English section. For link-only data the download table SHALL be replaced by the upstream access links and their license statement.

#### Scenario: Hosted dataset page
- **WHEN** a visitor opens the page of a hosted dataset with two versions
- **THEN** the download table lists the latest version's files with sizes and SHA-256 values, and the version history lists both versions with their release dates and change notes, and their DOIs where deposited

#### Scenario: Collector without consent
- **WHEN** a dataset's collector has not consented to be displayed
- **THEN** the page credits the collector's institution or the upstream source instead, and does not indicate that a name was withheld

### Requirement: Wanted-data list
`/wanted/` SHALL list every wanted record in one prerendered table with its title, domains, reason, request count (which MAY be zero), and status of collection (徵求中, 找到來源, 整理中, 無法提供 with reason), each with an anchor and a link to add a request or offer a lead. A wanted record that becomes published SHALL stay on `/wanted/` as a 已收錄 row linking to its dataset page, so that old `/wanted/#<id>` links still lead somewhere. At launch the list SHALL contain the seven former placeholders: 課業諮詢網絡, 人口遷徙, 港口貿易, 生物食物鏈, 縣市路網, 航空路線, 文獻引用網絡. Wanted entries SHALL NOT have detail pages or Dataset structured data.

#### Scenario: Wanted becomes published
- **WHEN** the 人口遷徙 wanted record changes to published with a hosted version
- **THEN** it appears in `/datasets/` with the same identifier, and its `/wanted/#<id>` row is marked 已收錄 and links to the new detail page
