## Purpose

Defines the catalog of network-related college courses offered in Taiwan: what a course record and an offering are, which courses are included, how they are shown and kept fresh, and how they are collected by one maintainer without scraping that universities forbid.

## ADDED Requirements

### Requirement: Course and offering records
The course catalog SHALL store one record per recurring course and, inside it, one entry per semester offering. A course record SHALL have a permanent ASCII identifier, the university (by a short key that maps to the institution's Mandarin and English names and ROR identifier), the department, the official Mandarin title, a category, a relevance class, an offering type, the level (undergraduate, master, doctoral, mixed, professional or non-credit), the language or languages of instruction, provenance (how it was found, when it was added, when it was last reviewed), and at least one offering. Each credit-course offering SHALL have a term in the form `<學年度>-<學期>` (`114-1`, `114-2`, or `114-S` for summer), the instructors as published by the university, an evidence URL showing that the offering exists, and the date the maintainer last verified that URL. Non-credit offerings SHALL use start and end dates instead of a term. A fact that could not be confirmed at its source (an offering whose evidence page could not be opened, its instructors, its course code, or the languages of instruction) SHALL be left blank or marked unverified with the date of the check, and SHALL NOT be guessed; an unverified offering keeps the evidence URL that was tried. The build SHALL validate every record against the published course JSON Schema and fail on any violation.

#### Scenario: Course without offerings
- **WHEN** a course record has no offering
- **THEN** the build fails, because an unverified course is not listed

#### Scenario: Missing evidence
- **WHEN** an offering is added without an evidence URL or a verification date
- **THEN** the build fails and names the course and offering

#### Scenario: Unconfirmed language
- **WHEN** a university page does not state the language of instruction
- **THEN** the record leaves the languages blank with an unverified marker and its check date, and the course table shows 「未確認」

#### Scenario: Summer term
- **WHEN** an offering has term `114-S`
- **THEN** it is accepted and displayed as 114 學年度暑期 (2026 夏)

### Requirement: Inclusion rules are explicit and published
A course SHALL be included only if networks or graphs are its primary subject (`core`) or a substantial unit of about three weeks or more (`partial`), in one of four categories: network science, social network analysis, graph theory, or graph machine learning. Courses where 網路/網絡/network refers to computer networking, the internet as a medium, electrical circuits, neural networks, tensor networks or actor-network theory SHALL be excluded, and the maintainer SHALL record each rejected candidate with a reason so that it is not reconsidered every semester. Each included course SHALL carry a one-sentence inclusion note. The rules SHALL be published on `/courses/` in Mandarin with the note 「本站的『網路／網絡』指網絡科學（network science），非電腦網路課程」.

#### Scenario: Computer networking course rejected
- **WHEN** the discovery process finds a course titled 計算機網路
- **THEN** it is not added to the catalog and is recorded in the rejected list with the reason 電腦網路

#### Scenario: Misleading title kept
- **WHEN** a course titled 網路策略 has a syllabus centred on social network analysis methods
- **THEN** it can be included with category social network analysis and an inclusion note explaining why

### Requirement: Taiwan scope and international references
Only courses offered by institutions in Taiwan SHALL appear in the course table, in search results, and in the course API. Courses and teaching materials from outside Taiwan that the previous `/refs` page listed SHALL be kept in a separate section 「國外參考課程與教材（非台灣開課）」 at `/courses/#international`, as a plain list with a last-checked date, outside the table, the search index and the API.

#### Scenario: Foreign course not searchable
- **WHEN** a visitor searches `CS224W` in 課程 mode
- **THEN** no course result is returned, and the international section is not counted as a result

#### Scenario: Old refs content preserved
- **WHEN** a visitor follows an old link to `/refs`
- **THEN** they reach `/courses/`, where the UCLA, UMich and Stanford entries and the teaching report appear in the international section

### Requirement: Course table page
`/courses/` SHALL show a prerendered table of all included courses with columns 課程名稱 (Mandarin and English), 學校, 系所, 教師 (from the latest offering), 最近開課, 層級 and 授課語言, sorted by most recent offering first. Terms SHALL be displayed with their Gregorian season, for example 「115-1（2026 秋）」.

#### Scenario: Term display
- **WHEN** a course's latest offering is `114-2`
- **THEN** the 最近開課 cell shows 「114-2（2026 春）」

### Requirement: Course detail page and freshness
Each course SHALL have a detail page at `/courses/<id>/` listing its offerings newest first, each with term, instructors, a link to the evidence page, and the verification date. The page SHALL show a freshness label computed at build time from the latest offering relative to the current term: 本學期開課 (current term), 最近開課：<term> (within the last four regular terms), 近年未開課 (more than four regular terms ago), or 歷史紀錄 (records kept for history, such as the 2018 NCKU STAT1021 lectures). Summer terms SHALL NOT count toward the four. The site SHALL be rebuilt automatically at least once a month, so labels follow the calendar even without content changes. Course pages SHALL link to syllabi rather than copy syllabus text; any summary SHALL be written by the maintainer.

#### Scenario: Dormant course
- **WHEN** a course's latest offering is five or more terms before the current term
- **THEN** its page and table row show 近年未開課 and the row is visually de-emphasized

#### Scenario: Historical STAT1021
- **WHEN** a visitor opens the NCKU 資料科學導論 course record
- **THEN** it shows the 106-2 offering labelled 歷史紀錄 with relevance partial, and links to `/stat1021/`

### Requirement: Collection respects university terms
Course collection SHALL use official exports, open data (such as the ISAC course CSV under the government open-data license), manual lookup, and submissions from instructors or the public. Any discovery script SHALL obey each site's robots.txt, SHALL NOT solve CAPTCHAs or call endpoints that robots.txt disallows, SHALL rate-limit its requests, and SHALL only propose candidates for human review; it SHALL NOT add records by itself. Instructor information SHALL be limited to names and links the university has already published. When course facts are taken from an open-data source under 政府資料開放授權條款－第1版 (such as the ISAC course CSV), `/courses/` SHALL reproduce that source's 顯名聲明.

#### Scenario: Blocked endpoint
- **WHEN** a university's robots.txt disallows its course API path
- **THEN** the discovery script skips that source and reports it as manual-only

#### Scenario: Script output
- **WHEN** the discovery script runs
- **THEN** it produces a candidate list for review and changes no published course record

### Requirement: Semester refresh
At the start of each semester (late July to August for semester 1, late January to February for semester 2), the maintainer SHALL re-check every course that is not historical and record the new offering or leave the freshness label to age. The course API manifest SHALL report the date of the last refresh.

#### Scenario: Refresh date visible
- **WHEN** an agent fetches `/api/v1/index.json`
- **THEN** it contains the date the course catalog was last refreshed
