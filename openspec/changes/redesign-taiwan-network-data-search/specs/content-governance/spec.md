## Purpose

Defines the rules that decide what the catalog may contain and how people can add to it, request data, or have content corrected or removed, so that a personally run site can publish Taiwan relational data under 個人資料保護法 and third-party licenses without harming the people the data describes.

## ADDED Requirements

### Requirement: Personal-data level on every dataset
Every dataset record SHALL carry one of four personal-data levels, and the level SHALL decide what the site may do:
- `none`: no personal data (for example transport flows, input–output tables, aggregate migration counts with no small cells): re-hosting is allowed when the license permits it.
- `public-role`: people acting in public roles whose role data was lawfully published (for example legislators, election candidates, award nominees, professional athletes): re-hosting is allowed when the license permits it, only role-relevant fields may be included, the data SHALL NOT be enriched with other personal attributes, and the page SHALL show an objection link.
- `private-individuals`: lawfully public data about private or semi-public individuals (for example company directors, political donors, court judgments): metadata and a link to the upstream source only; a projection to institutions or organisations with no individual nodes may be re-hosted.
- `sensitive`: sensitive data (health, sex life, criminal records, location traces, minors) or social graphs of private people scraped from platforms (for example PTT, Dcard, Facebook, LINE): the site SHALL NOT host the data. It MAY list such a dataset only when a research institution publishes it under controlled access (for example a data-use agreement), and then SHALL link only to that access gate, never to raw files.
The build SHALL fail if a `private-individuals` or `sensitive` record has hosted files, or if a `sensitive` record links to anything other than a controlled-access landing page. Records at these two levels SHALL NOT embed person-level data in their pages, JSON records or JSON-LD. A published record SHALL carry the date on which its personal-data level was last reviewed. No page, JSON record or file of the site SHALL link to person-level data about private individuals that was published without their consent, including data the site itself does not host.

#### Scenario: Private individuals cannot be hosted
- **WHEN** a record with level `private-individuals` declares a hosted version
- **THEN** the build fails and names the record

#### Scenario: Sensitive data only behind an access gate
- **WHEN** a `sensitive` record declares a download URL that is not a controlled-access landing page
- **THEN** the build fails and names the record

#### Scenario: Public-role data
- **WHEN** the 金馬獎 nominee network (level `public-role`) is published
- **THEN** its page states that it contains the names of publicly announced nominees in their professional roles and links to the objection and takedown procedure

### Requirement: Pseudonymisation is not treated as anonymity
The site SHALL treat a network whose nodes are individuals as personal data even when names are removed, because network structure can re-identify people. Aggregated tables SHALL be checked for small cells; any cell counting fewer than 3 individuals SHALL be suppressed or merged before a re-hosted copy is published, and the record SHALL state the threshold used.

#### Scenario: Small cells in migration data
- **WHEN** a village-level migration table contains cells with a count of 1
- **THEN** the hosted copy aggregates those cells to a level where every published count is at least 3, and the record documents the aggregation

#### Scenario: Counts of events, not individuals
- **WHEN** an aggregate counts events such as trips, with no attributes of the people making them, and the source already publishes finer counts under an open license
- **THEN** small cells are published as the source gives them, and the record states why they are not suppressed

### Requirement: Takedown and correction procedure
The site SHALL publish a takedown and correction procedure at `/about/#takedown` in Mandarin, with an English summary, reachable from every page footer. Any person named in a dataset or course record, and any rights holder, MAY use it. Requests by email, by the request form, or by GitHub issue SHALL receive an acknowledgement within 7 days; an automatic reply on the contact address SHALL satisfy this. On a credible request concerning personal data, the maintainer SHALL suspend downloads of the affected files within 3 days, pending review. Suspension means deleting the objects from the site's storage, invalidating their CDN paths, marking the version as suspended in the API, and asking the archival repository to restrict any deposited copy. A decision SHALL be made within 30 days, extendable once by 30 days with notice to the requester. A removed dataset or version SHALL leave a tombstone: its identifier, title, removal date and a reason remain at its URL and in the API, with no files. When an upstream source withdraws data that the site re-hosts, the site SHALL mirror the withdrawal.

#### Scenario: Personal-data complaint
- **WHEN** a person asks for their node to be removed from a hosted network
- **THEN** they receive an acknowledgement within 7 days, the affected files stop being downloadable within 3 days, and a decision follows within 30 days

#### Scenario: Instructor asks for removal
- **WHEN** an instructor asks that their name be removed from a course record
- **THEN** the request is handled by the same procedure, and the offering stays listed with the instructor shown as 「未列出」 if the course itself remains

#### Scenario: Tombstone
- **WHEN** a dataset is withdrawn
- **THEN** `/datasets/<id>/` returns a page stating that the dataset was withdrawn, with the date and reason and no download links

### Requirement: Third-party terms are honoured
The site SHALL record, for every hosted file, the license that permits redistribution. It SHALL reproduce any attribution statement the license requires; for 政府資料開放授權條款－第1版 this is the 顯名聲明 text. It SHALL NOT re-host data whose terms forbid redistribution or bulk republication (for example depositar-hosted files whose terms forbid republishing as another database), unless the rights holder has given written permission recorded in the private researcher log.

#### Scenario: OGDL attribution
- **WHEN** a hosted dataset derives from a data.gov.tw source under 政府資料開放授權條款－第1版
- **THEN** its page, its JSON record and a README inside its download bundle reproduce the required 顯名聲明 with the provider's name

### Requirement: Contribution and data-request channels
The site SHALL offer three channels to suggest a dataset, contribute data, or request data that does not exist yet: a web form that needs no account, an email address, and a GitHub issue form. Each SHALL be pre-filled with the visitor's query when reached from an empty search. Requests SHALL be reviewed by the maintainer and, when accepted, recorded as wanted-data entries with a request count. Submitted personal data (for example the requester's email) SHALL be used only to reply and SHALL NOT be published.

#### Scenario: Request from empty search
- **WHEN** a visitor clicks the request link on an empty search for 港口貿易
- **THEN** the request form opens with 港口貿易 filled in as the requested data

#### Scenario: Requester privacy
- **WHEN** a request is turned into a wanted-data entry
- **THEN** the entry shows the topic and request count and does not show the requester's name or email unless they opted in

### Requirement: Privacy notice
`/about/#privacy` SHALL state in Mandarin what personal data the site processes (request-form submissions, CDN access logs if enabled, the researcher registry), the purpose, the retention period, and how to exercise the rights to inquire, review, copy, correct, stop processing and delete under 個人資料保護法 第3條. The notice SHALL be updated in the same change as any new kind of processing.

#### Scenario: New processing disclosed
- **WHEN** a change introduces a new kind of personal-data processing, such as query logging
- **THEN** the same change updates `/about/#privacy`
