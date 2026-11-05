## Purpose

Defines the public page set, navigation, home and about content, news, URL conventions, language of the site, and what happens to every URL the old site published, so that netscied.tw reads as a Mandarin-first search site for Taiwan network data and courses while old links keep working.

## ADDED Requirements

### Requirement: Page set and navigation
The site SHALL publish these HTML pages, and no other top-level HTML pages: home `/`, search results `/search/`, dataset catalog `/datasets/`, one detail page per published or withdrawn dataset at `/datasets/<id>/`, wanted-data list `/wanted/`, course catalog `/courses/`, one detail page per course at `/courses/<id>/`, news archive `/news/`, about `/about/`, the archived course page `/stat1021/`, and a not-found page. Machine-readable files under `/api/`, `/data/` and `/files/` are specified by other capabilities. The primary navigation SHALL contain exactly four items, in this order: 資料集 (`/datasets/`), 課程 (`/courses/`), 消息 (`/news/`), 關於 (`/about/`). Every page except home SHALL show a compact search form in the header.

#### Scenario: Primary navigation
- **WHEN** a visitor opens any page
- **THEN** the header shows the links 資料集, 課程, 消息, 關於 in that order, and no link to 電腦工具 or 網絡素養小冊

#### Scenario: Header search on inner pages
- **WHEN** a visitor opens `/datasets/` or any detail page
- **THEN** the header contains a search form that submits to `/search/`

### Requirement: Minimal home page
The home page SHALL consist of the site name, a one-line statement of purpose, the search form with its 資料/課程 toggle, an honest count line (number of published datasets, courses, and wanted entries), and the three most recent news items with a link to `/news/`. It MAY show up to five example queries, and each example query shown SHALL return at least one result. The home page SHALL NOT contain the former long introductory essay.

#### Scenario: Home content
- **WHEN** a visitor opens `/`
- **THEN** the page shows the search form, the count line (for example 「目前收錄 8 筆資料集、15 門課程 · 7 項資料徵求中」), and exactly the three newest news items

#### Scenario: Example queries never dead-end
- **WHEN** the site is built and an example query configured for the home page returns zero results
- **THEN** that example is omitted from the page and the build prints a warning naming it

#### Scenario: Empty catalog
- **WHEN** no dataset is published
- **THEN** the home page still builds, shows 「目前收錄 0 筆資料集」 and a link to `/wanted/`, and shows no example queries

### Requirement: About page absorbs secondary content
The about page SHALL state the mission in at most three sentences and SHALL contain anchored sections for: how to provide or request data (`#contribute`), how to cite the site and the license of the catalog metadata, which SHALL be CC0 1.0 (`#cite`), the takedown and correction policy (`#takedown`), the privacy notice (`#privacy`), a disclaimer (免責聲明) that the site does not guarantee the accuracy of upstream data and that legal statements are not legal advice (`#disclaimer`), publications including the 《網絡素養》 booklet (`#booklet`), the site history, the maintainer and contact address, and machine-readable access for programs and AI agents (`#machine-access`). The footer of every page SHALL link to `/about/#contribute`, `/about/#takedown`, and the contact address.

#### Scenario: Booklet reachable as a link
- **WHEN** a visitor opens `/about/#booklet`
- **THEN** the section links to the Mandarin and English booklet PDFs, re-hosted under `/files/` or, if no copy is available, to an archived copy labelled as such; no separate booklet page exists

#### Scenario: Takedown policy reachable from every page
- **WHEN** a visitor opens any page
- **THEN** the footer contains a link to `/about/#takedown`

### Requirement: News
Each news item SHALL be one file in the repository with a date, a Mandarin title, a Mandarin body, an optional English title, optional related dataset or course identifiers, and a permanent anchor identifier `<YYYY-MM-DD>-<slug>`. The build SHALL fail on duplicate anchors or unknown related identifiers. `/news/` SHALL list all items newest first, each with a `<time datetime>` and its anchor. The four 2018–2019 items SHALL be migrated with their content unchanged, and a relaunch item SHALL be added when this change ships. When a dataset is published for the first time, the build SHALL generate a news item for it from the catalog (title, link, date), unless the record sets a flag that suppresses it. New versions of existing datasets SHALL NOT generate news automatically.

#### Scenario: Deep link
- **WHEN** a visitor opens `/news/#2019-03-12-scientific-american`
- **THEN** the page scrolls to that item

#### Scenario: First publication generates news
- **WHEN** a wanted record becomes published
- **THEN** a news item linking to its page appears on `/news/`, on the home page and in the feed

#### Scenario: Monthly versions do not flood news
- **WHEN** a monthly-updated dataset releases its twelfth version
- **THEN** no news item is generated for that version

### Requirement: Atom feed
The site SHALL publish an Atom 1.0 feed at `/news/feed.xml` containing the 20 newest news items, or all of them if there are fewer, with stable entry identifiers. Every page SHALL advertise it with `<link rel="alternate" type="application/atom+xml">`.

#### Scenario: Feed reader subscribes
- **WHEN** a feed reader fetches `/news/feed.xml`
- **THEN** it receives a valid Atom document whose newest entry matches the newest item on `/news/`

### Requirement: URL conventions
Canonical page URLs SHALL be lowercase ASCII with hyphen-separated words and SHALL end with a trailing slash. Dataset and course identifiers SHALL be permanent: a published identifier SHALL never be reassigned to a different record, and renaming SHALL add a permanent redirect from the old identifier. A request for an extensionless path without a trailing slash SHALL be answered with a 301 redirect to the same path with a trailing slash, preserving the query string. A request for `<path>/index.html` SHALL be answered with a 301 redirect to `<path>/`. Requests to `www.netscied.tw` SHALL be answered with a 301 redirect to the same path on `netscied.tw`.

#### Scenario: Trailing slash canonicalization
- **WHEN** a client requests `/datasets?x=1`
- **THEN** the response is a 301 with `Location: /datasets/?x=1`

#### Scenario: Renamed identifier
- **WHEN** a dataset identifier is renamed from `a-old` to `a-new` and a client requests `/datasets/a-old/`
- **THEN** the response redirects to `/datasets/a-new/`

#### Scenario: www host
- **WHEN** a client requests `https://www.netscied.tw/courses/`
- **THEN** the response is a 301 to `https://netscied.tw/courses/`

### Requirement: Legacy URLs keep working
Every path the previous site published SHALL keep resolving, with a 301 redirect or a meaningful page, according to this map: `/networks` → `/datasets/`; `/refs` → `/courses/`; `/booklet` → `/about/#booklet`; `/tools` → `https://github.com/junipertcy/Network-Code-Repository`; `/stat1021` → `/stat1021/` (kept as an archived page). Redirects SHALL preserve the query string. The redirect map SHALL live in one version-controlled file read by both the build and the edge configuration.

#### Scenario: Old catalog link
- **WHEN** a client requests `https://netscied.tw/networks`
- **THEN** the response is a 301 to `https://netscied.tw/datasets/`

#### Scenario: Removed tools page
- **WHEN** a client requests `/tools`
- **THEN** the response is a 301 to the Network-Code-Repository on GitHub

### Requirement: Archived course page without personal data
`/stat1021/` SHALL show the 2018 NCKU guest-lecture content under a banner 「2018 年課程封存頁 · Archived」, with a link to its course record. It SHALL NOT link to the in-class friendship questionnaire, to its data files, or to any repository holding them. It SHALL NOT re-host third-party slides; it SHALL link to the original authors' copies instead. The build SHALL fail if any page links to a URL on the personal-data denylist kept in the repository.

#### Scenario: Archived page
- **WHEN** a visitor opens `/stat1021/`
- **THEN** the lecture description, schedule and announcements are shown under the archive banner, and there is no link to the friendship questionnaire, its results, or the `networkie` repository

#### Scenario: Denylisted link blocked
- **WHEN** a page template contains a link to a denylisted personal-data URL
- **THEN** the build fails and names the page and the URL

### Requirement: Real not-found responses
A request for a path that is neither a page, a published file, nor a redirect source SHALL receive HTTP status 404 with a Mandarin not-found page that contains the search form and links to `/datasets/` and `/courses/`. The not-found page SHALL carry `noindex`. No path SHALL return the home page with status 200 as a fallback.

#### Scenario: Missing page
- **WHEN** a client requests `/does-not-exist/`
- **THEN** the response status is 404 and the body is the not-found page

#### Scenario: Missing machine file
- **WHEN** a client requests `/.well-known/does-not-exist`
- **THEN** the response status is 404, not 200 with HTML

### Requirement: Mandarin-first language
Every page SHALL declare `lang="zh-Hant-TW"` on the root element and SHALL present its interface text in Traditional Mandarin as used in Taiwan. Dataset and course detail pages SHALL also contain an English section marked `lang="en"` with the record's English title and summary when the record has them. This change SHALL NOT publish a separate English mirror; the path prefix `/en/` SHALL be reserved and SHALL return 404.

#### Scenario: Language declaration
- **WHEN** any page is fetched
- **THEN** the root element has `lang="zh-Hant-TW"`

#### Scenario: English abstract on a record
- **WHEN** a dataset record has an English title and summary and its detail page is fetched
- **THEN** the page contains a section with `lang="en"` showing that title and summary

### Requirement: Pages are complete without JavaScript
Every page SHALL deliver its full content in the prerendered HTML, so that it is readable with JavaScript disabled and by crawlers that do not execute JavaScript. The only exception is the result list on `/search/`. Interactive enhancements such as table sorting SHALL appear only after the page becomes interactive.

#### Scenario: No-JS catalog
- **WHEN** `/datasets/` is fetched by a client that does not run JavaScript
- **THEN** the response HTML contains a complete `<table>` with one row per published dataset

#### Scenario: Sort controls only when they work
- **WHEN** `/datasets/` is rendered without JavaScript
- **THEN** no sort buttons are shown
