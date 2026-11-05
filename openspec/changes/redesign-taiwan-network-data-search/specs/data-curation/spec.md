## Purpose

Defines how one maintainer turns upstream Taiwan relational data into the site's own hosted copies: fetching, keeping evidence of the original source, deciding what may be re-hosted, converting to canonical formats, computing statistics, verifying integrity, versioning, and recording provenance and attribution.

## ADDED Requirements

### Requirement: Human gate on publication
No automated process SHALL publish a dataset or a dataset version. Fetching, conversion and validation MAY run automatically, but uploading files to the site's data storage SHALL require an explicit approval by the maintainer. Automated jobs that propose content, now or in later changes (for example discovery sweeps or AI-assisted triage), SHALL have no credentials for the data storage and SHALL only propose changes for review.

#### Scenario: Pipeline finishes a conversion
- **WHEN** the pipeline converts a new upstream release successfully
- **THEN** it opens a change for review, and nothing is uploaded until the maintainer approves it

### Requirement: Reproducible fetch recipes
Every dataset with hosted versions SHALL have a recipe listing each upstream source with its retrieval method (`get`, `api`, `git`, or `manual`), its URL or step-by-step manual instructions, the expected SHA-256 and size once first retrieved, the retrieval date, and the landing page. Automated fetches SHALL identify themselves with a user agent that includes a contact URL, SHALL obey robots.txt, SHALL make at most one request per second per host, and SHALL back off on HTTP 429 and 503. For manual sources, the maintainer's downloaded file SHALL be recorded with its SHA-256, size and retrieval date, and automated jobs SHALL only verify it, never re-fetch it.

#### Scenario: Upstream bytes differ from the recipe
- **WHEN** a fetch returns a file whose SHA-256 differs from the recipe's expected value
- **THEN** the job fails and reports an upstream change instead of producing a version

#### Scenario: Portal needs a browser
- **WHEN** an upstream portal requires a form submission or a CAPTCHA
- **THEN** the recipe uses the `manual` method with written steps, and no automated job attempts the form

### Requirement: Evidence of the original source
For each hosted version, the pipeline SHALL keep the upstream files byte-for-byte when their license permits redistribution, and SHALL publish them in the version's `original/` folder. It SHALL request an Internet Archive capture of each source's landing page, as evidence of the license terms at retrieval time, and SHALL record the capture URL. For data that may not be redistributed, the site SHALL keep only URLs, hashes, response headers and retrieval dates. Any temporary copy kept while permission is pending SHALL stay on the maintainer's own machine, and SHALL be deleted when permission is refused or after 180 days.

#### Scenario: Link-only source
- **WHEN** a source is classed `link-only`
- **THEN** none of its data files exists in the site's storage, and its record holds only URLs, hashes, headers and retrieval dates

### Requirement: License classes decide permitted operations
The pipeline SHALL map each upstream license to one class by deterministic code, and SHALL enforce that class's permitted operations:
- `permissive` (CC0, PDDL, CC BY, ODC-By, 政府資料開放授權條款－第1版): re-host, convert and derive. Derivatives of OGDL-Taiwan-1.0 data may be released under CC BY 4.0 with the 顯名聲明 preserved.
- `share-alike` (CC BY-SA, ODbL): as permissive, but derivatives keep the same license, and sources under different share-alike licenses SHALL NOT be merged into one dataset.
- `non-commercial` (CC BY-NC, BY-NC-SA): re-host and derive under the same license, only while the site remains non-commercial, with a 非商業使用 label.
- `no-derivatives` (CC BY-ND, BY-NC-ND): re-host the originals and lossless format conversions only, labelled 格式轉換，內容未修改, with no cleaning or subsetting.
- `link-only` (no license, all rights reserved, terms forbidding redistribution, registration-gated or platform-restricted data): metadata and link only.
- `permission`: operations as granted in a written permission recorded in the private researcher log.
The record's redistribution basis SHALL be consistent with the class: `license-permits` for the first four, `written-permission` for `permission`, `link-only` for `link-only`, or `own-work` when the site compiled the data itself. A personal-data restriction from the content-governance rules SHALL override every class.

#### Scenario: No-derivatives source
- **WHEN** a CC BY-ND dataset is processed
- **THEN** the pipeline produces GraphML and CSV conversions that preserve every identifier and attribute, and refuses any cleaning or subsetting step

#### Scenario: Mixed share-alike sources
- **WHEN** a recipe combines a CC BY-SA source and an ODbL source into one dataset
- **THEN** the pipeline refuses to build it

### Requirement: Canonical formats per structure kind
Each hosted version SHALL include a canonical, lossless, text-based representation chosen by its structure kind:
- graphs (including bipartite, multigraph, temporal and multilayer): a CSV bundle of `nodes.csv` and `edges.csv` (plus `layers.csv` when needed), described by a Frictionless `datapackage.json`, with time and layer as columns, and a GraphML file;
- hypergraphs and simplicial complexes: HIF JSON, with simplicial complexes stored as facets with network type `asc`;
- rankings: PrefLib format;
- pairwise comparisons: a comparisons CSV with items, outcome and date.
Converters SHALL be built when the first dataset of a kind is hosted. All text SHALL be UTF-8 without a byte-order mark, and every canonical file SHALL validate against its format's schema.

#### Scenario: Hypergraph
- **WHEN** the 立法院 co-sponsorship hypergraph is converted
- **THEN** the version contains a HIF JSON file that validates against the official HIF schema

#### Scenario: Round trip
- **WHEN** a graph version's GraphML file is loaded and compared with its CSV bundle
- **THEN** both have the same node count, edge count, and attribute values

### Requirement: Computed statistics
For each hosted version, the pipeline SHALL compute the counts appropriate to each structure kind and record them in the version manifest: for graphs, nodes, edges, per-partition counts, repeated pairs, self-loops, isolated nodes and components; for hypergraphs, nodes, hyperedges, incidences and edge-size range; for rankings, alternatives and voters; for pairwise comparisons, items, comparisons and ties. Each manifest SHALL record the tool and version that computed the statistics. Data-quality findings, such as repeated edges, SHALL be reported in the version's change note.

#### Scenario: Repeated edges reported
- **WHEN** the 金馬獎 2018 data is converted and has 146 edges but 133 unique film–person pairs
- **THEN** the manifest records 13 repeated pairs, and the change note mentions them

### Requirement: Integrity and monthly health check
Every file of a hosted version SHALL have its SHA-256 and byte size recorded in the version manifest and in a `SHA256SUMS` file in the version's folder. One scheduled job SHALL run at least monthly. It SHALL re-hash every published file, check every hosted dataset's upstream sources for changes (HTTP validators, checksums, or the portal's modification date), and check that every external access link still resolves. It SHALL report all findings in a single issue for the maintainer. It SHALL NOT change any record or file.

#### Scenario: Silent corruption detected
- **WHEN** a published file's bytes no longer match its recorded SHA-256
- **THEN** the monthly issue names the dataset, version and file

#### Scenario: Upstream updated
- **WHEN** data.gov.tw reports a new modification date for a source dataset
- **THEN** the monthly issue lists it, and no version is produced automatically

### Requirement: Immutable semantic versions
Dataset versions SHALL be identified by semantic version strings: PATCH for the same data repackaged or re-serialized, MINOR for data added while earlier data stays retrievable, MAJOR for data changed or removed. The release date and the upstream snapshot date SHALL be recorded separately. A version manifest and its files SHALL be immutable once published, and a correction SHALL be a new version. The only exceptions are recording a DOI once it is minted, and the takedown procedure, which removes files and keeps the manifest as a tombstone.

#### Scenario: Correction
- **WHEN** an error is found in version 1.0.0
- **THEN** a version 1.0.1 or 2.0.0 is released, and version 1.0.0's files and manifest remain unchanged

#### Scenario: Edited manifest rejected
- **WHEN** a change modifies a published manifest other than by adding a withdrawal or a newly minted DOI
- **THEN** validation fails

### Requirement: Provenance, attribution and reproducibility in every version
Each hosted version SHALL include:
- a provenance record listing every source (URL, retrieval date, SHA-256, archived landing-page URL, license evidence), the pipeline's source-code commit and lockfile hash, and a human-readable list of transformations (for example "kept 13 repeated edges as multi-edges");
- a bilingual `ATTRIBUTION.txt` containing every attribution statement the upstream licenses require, including the 顯名聲明 for 政府資料開放授權條款－第1版 sources;
- a citation that uses the version's DOI when one exists, and otherwise the version's URL on the site.

The pipeline environment SHALL be pinned. Rebuilding a version from its recipe and recorded inputs SHALL reproduce byte-identical canonical files.

#### Scenario: Rebuild
- **WHEN** the maintainer rebuilds version 1.0.0 from its recipe and recorded inputs at the recorded pipeline commit
- **THEN** the canonical CSV or HIF files have the same SHA-256 values as published

#### Scenario: Attribution travels with the files
- **WHEN** someone downloads the zip of a version derived from a data.gov.tw source
- **THEN** the zip contains `ATTRIBUTION.txt` with the provider's 顯名聲明
