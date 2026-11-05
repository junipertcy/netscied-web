## Purpose

Defines the single search bar that is the site's main entry point: how Mandarin, English and Simplified-Chinese natural-language queries find datasets or courses, how results and empty results are presented, and how search quality is checked before every release.

## ADDED Requirements

### Requirement: One search form with a 資料/課程 toggle
The site SHALL provide one search form consisting of a labelled text input, a two-option toggle (資料, 課程), and a visible submit button labelled 搜尋. The toggle SHALL default to 資料. The form SHALL submit with HTTP GET to `/search/` using the parameters `q` (the query) and `type` (`datasets` or `courses`), so that it works without JavaScript and every search has a shareable URL. An absent `type` SHALL mean `datasets`.

#### Scenario: Default search
- **WHEN** a visitor types 金馬獎 and presses Enter with the toggle untouched
- **THEN** the browser navigates to `/search/` with `q=金馬獎` and `type` absent or `datasets`, and dataset results are shown

#### Scenario: Course search
- **WHEN** a visitor selects 課程, types 社會網絡分析 and submits
- **THEN** the browser navigates to `/search/` with `q=社會網絡分析&type=courses`, and course results are shown

#### Scenario: Shared link
- **WHEN** someone opens a copied `/search/?q=超圖` URL in a new browser
- **THEN** the same results are shown as for the person who searched

### Requirement: IME-safe input
Search SHALL never run on text that is still being composed by an input method editor (注音, 倉頡, 拼音 and others). Pressing Enter to confirm an IME candidate SHALL NOT submit the form. If results update while typing, they SHALL update only after composition ends.

#### Scenario: Zhuyin confirmation
- **WHEN** a visitor composes ㄐㄧㄣ with a Zhuyin IME and presses Enter to select 金
- **THEN** the form is not submitted and no search runs until the visitor presses Enter again with no composition active

### Requirement: Query understanding for Mandarin, English and Simplified Chinese
Matching SHALL treat the following as equivalent, both in records and in queries: Traditional and Simplified forms of the same character; 臺 and 台; 網絡 and 網路; full-width and half-width Latin letters and digits; upper and lower case. Matching SHALL NOT depend on spaces between Chinese words. Each record SHALL also be matched through the bilingual labels of the controlled concepts it carries (structure kind, properties, domain, and curated aliases), so that an English query finds a record whose text is only in Mandarin, and vice versa. Filler words common in natural-language Mandarin queries (for example 有沒有, 我想找, 相關, 的, 資料, 台灣) SHALL NOT be required to match.

#### Scenario: Simplified query
- **WHEN** a visitor searches 台北捷运
- **THEN** a dataset whose title is written 臺北捷運 is returned

#### Scenario: English query over Mandarin record
- **WHEN** a visitor searches `hypergraph`, and a published record whose text is only in Mandarin carries the structure kind hypergraph
- **THEN** that record is returned

#### Scenario: English query in course mode
- **WHEN** a visitor searches `social network analysis` with the 課程 toggle
- **THEN** courses in the social-network-analysis category are returned even if their text is only in Mandarin

#### Scenario: Natural-language query
- **WHEN** a visitor searches 有沒有立委連署的網絡資料
- **THEN** a legislative co-sponsorship dataset, if published, is ranked first

### Requirement: Computer-networking ambiguity is handled
Because 網路 also means computer networks and the internet in Taiwan, a query that expresses computer-networking intent (for example 計算機網路, 電腦網路, 網路協定, TCP/IP, computer network) SHALL NOT rank social, transport, political or other non-internet datasets in the top five results, and SHALL show a hint that the 課程 toggle may be what the visitor wants. The course catalog's inclusion rules decide whether any computer-networking course exists at all.

#### Scenario: Networking query in data mode
- **WHEN** a visitor searches 計算機網路 with the 資料 toggle
- **THEN** no social-network, film, legislative or transport dataset appears in the top five, and a hint offers to search courses instead

### Requirement: Ranking and result presentation
Results SHALL include only published records; withdrawn records SHALL NOT appear. Results SHALL be ordered by relevance, weighting matches in the title above keywords and concept labels, and those above the description. Each dataset result SHALL show the Mandarin title, the English title when present, a one-line description, structure badges, domain, size, license, and the latest version (or 「外部連結」). Each course result SHALL show the title, university and department, instructor, most recent term in both 學年度-學期 and Gregorian form, level, and language of instruction. The results page SHALL announce the number of results in a live region, and SHALL tell the visitor how many results the other toggle option would return. Query text SHALL be rendered as text, never as markup, and SHALL be URL-encoded wherever it is placed in a link.

#### Scenario: Title match outranks description match
- **WHEN** two datasets match 捷運, one in its title and one only in its description
- **THEN** the title match is ranked higher

#### Scenario: Cross-type hint
- **WHEN** a visitor searches 社會網絡分析 in 資料 mode and one course matches
- **THEN** the results page states that one course also matches and links to the 課程 results

#### Scenario: Withdrawn dataset
- **WHEN** a visitor searches the title of a withdrawn dataset
- **THEN** it does not appear among the results

#### Scenario: Hostile query
- **WHEN** a visitor searches `<script>alert(1)</script>`
- **THEN** the page shows the text literally, executes nothing, and the prefilled request and external-catalog links contain the query URL-encoded

### Requirement: Edge-case queries
An empty query, or one that is empty after filler words are removed, SHALL show links to the full dataset and course tables instead of results. A query longer than 100 characters SHALL be truncated to its first 100 characters before matching, and the page SHALL say so. If the search data cannot be loaded, the page SHALL say that search is temporarily unavailable and link to `/datasets/`, `/courses/` and `/wanted/`.

#### Scenario: Empty query
- **WHEN** a visitor opens `/search/?q=` or searches only 台灣 的 資料
- **THEN** the page links to `/datasets/` and `/courses/`, shows the count of each, and shows no error

#### Scenario: Very long query
- **WHEN** a visitor pastes a 500-character paragraph into the search box
- **THEN** the search uses the first 100 characters and the page notes the truncation

#### Scenario: Search data fails to load
- **WHEN** the browser cannot fetch the search data
- **THEN** the page states 「搜尋暫時無法使用」 and links to the catalog tables

### Requirement: Empty and low-data states turn demand into the roadmap
When a dataset search returns no published dataset, the results page SHALL say that the site does not have such data yet (wording such as 「本站目前還沒有…」). It SHALL list any matching wanted-data entries in a visually separate group that is not counted as results, and SHALL offer a data-request link pre-filled with the query. It SHALL also offer links to external catalogs with the query pre-filled where the catalog supports it: at least data.gov.tw, depositar, Google Dataset Search and Zenodo, and Netzschleuder only for queries containing Latin letters. The page SHALL also link to the full dataset table. When a course search returns nothing, the page SHALL link to `/courses/`, to the course-suggestion channel, and to the Ministry of Education's 大學校院課程資源網.

#### Scenario: No dataset yet
- **WHEN** a visitor searches 人口遷徙, no published dataset matches, and a wanted entry 人口遷徙網絡 exists
- **THEN** the page states that the site has no such dataset yet, shows the wanted entry under a 徵求中 heading, and shows a request link and external catalog links that contain 人口遷徙

#### Scenario: Wanted entries are not results
- **WHEN** a search matches only wanted entries
- **THEN** the result count shown is zero, and no wanted entry is marked up as a schema.org Dataset

#### Scenario: No course found
- **WHEN** a course search returns nothing
- **THEN** the page links to `/courses/`, the course-suggestion channel, and 大學校院課程資源網

### Requirement: Search runs in the browser over static files
In this change, search SHALL run entirely in the visitor's browser against published static files, with no server-side search endpoint. The browser SHALL fetch the search data only when the visitor focuses the search input or opens the results page. The compressed search payload SHALL stay under 150 KB. Exceeding that limit SHALL fail the build; it is the trigger for a later change that moves search to a server endpoint.

#### Scenario: No search server
- **WHEN** a visitor searches
- **THEN** the browser fetches only static files from `netscied.tw`

#### Scenario: Payload budget
- **WHEN** the build produces a compressed search payload larger than 150 KB
- **THEN** the build fails with a message naming the budget

### Requirement: Search page without JavaScript
The `/search/` page SHALL carry `noindex, follow`. When JavaScript is unavailable, it SHALL show a message that results need JavaScript, links to `/datasets/`, `/courses/`, `/wanted/` and the static JSON catalog, and, while fewer than 50 datasets are published, the full list of published dataset titles linking to their pages.

#### Scenario: Visitor without JavaScript
- **WHEN** a visitor whose browser blocks JavaScript submits a search
- **THEN** the page shows the no-JavaScript message, the catalog links, and the list of published datasets

#### Scenario: Crawler fetches a search URL
- **WHEN** a crawler fetches `/search/?q=捷運`
- **THEN** the HTML contains a robots meta tag with `noindex` and links to the catalog pages

### Requirement: Search quality gate
The repository SHALL contain a gold query set of at least 20 queries spanning Traditional Mandarin, Simplified Chinese, English, mixed-language, generic-only and computer-networking cases. Each query SHALL list the records expected in its top results and the records forbidden from its top five. The build SHALL run the gold set against the same search code the browser uses, and SHALL fail if an expected published record is missing from a query's top five or a forbidden record appears there. For each Traditional-Mandarin gold query, the build SHALL also check that the Simplified form, the 臺/台-swapped form and the full-width form return the same top result. Expected records that are not currently published, for example withdrawn ones, SHALL be skipped rather than fail the build.

#### Scenario: Regression blocked
- **WHEN** a change to the alias table makes 計算機網路 return a film dataset in its top five
- **THEN** the build fails and names the query and the forbidden result

#### Scenario: Script invariance
- **WHEN** the gold query 臺北捷運旅次 returns a given top result
- **THEN** 台北捷運旅次, 台北捷运旅次 and the full-width variant return the same top result, or the build fails

#### Scenario: Takedown does not break the build
- **WHEN** a dataset expected by a gold query is withdrawn
- **THEN** the build passes and reports that expectation as skipped
