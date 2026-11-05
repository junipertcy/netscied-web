## Purpose

Defines how the site credits the Taiwanese researchers who collected its datasets, and how it keeps the log of contacting them, with the public, consent-gated part strictly separated from the private part (contact details, outreach history, permissions, notes) as 個人資料保護法 requires.

## ADDED Requirements

### Requirement: Two layers of credit
Dataset pages SHALL always show bibliographic credit: the authors of a cited work, with their names exactly as published in it. Person credit beyond that (affiliation, ORCID, homepage, role in the dataset) SHALL be shown only for people who have given recorded consent to be displayed, and only for the fields they agreed to. A person without such consent SHALL NOT appear in any public output of the site, except as a name inside a published citation.

#### Scenario: Consent given
- **WHEN** a researcher consents to display of their name, affiliation and ORCID for a dataset
- **THEN** the dataset page shows those three fields under 蒐集者與貢獻者, and the JSON-LD `creator` includes the ORCID

#### Scenario: No consent
- **WHEN** a dataset derives from a paper whose author has not consented
- **THEN** the page shows the paper's citation with the author's name as published, and no person credit entry, affiliation or ORCID for that author

### Requirement: Public person records contain only allowlisted fields
Public person records SHALL be keyed by an opaque random identifier (`p-` followed by 8 Crockford base32 characters) that is not derived from the person's name or email. They SHALL contain only: the identifier, Mandarin and English names, affiliation (with ROR identifier when available), ORCID, homepage, the consent date, and the list of fields the person agreed to display. The public schema SHALL reject any other field. The build SHALL fail if any public file contains a string that looks like an email address or a Taiwanese phone number, other than the site's own contact addresses.

#### Scenario: Contact field rejected
- **WHEN** a public person record contains an `email` field
- **THEN** validation fails

#### Scenario: Phone number leak caught
- **WHEN** a dataset description accidentally contains `0912-345-678`
- **THEN** the build fails and names the file

### Requirement: The private researcher log is outside every public system
The private log (contact details with their source and legal basis, outreach history, consent and permission records with evidence, notes, and follow-up dates) SHALL be kept where only the maintainer and explicitly invited co-curators can read it, separate from the public site repository. It SHALL NOT be stored in the public repository in any form, including encrypted. It SHALL NOT be stored in a public bucket, in build artifacts, or in prompts to AI services. The public repository's automation SHALL have no credentials for it. Public dataset records SHALL refer to a permission only by an opaque identifier (for example `perm-2026-0003`). The private log SHALL be backed up in encrypted form, and backups SHALL be rotated so that none is older than 3 months.

#### Scenario: Public CI has no access
- **WHEN** the public repository's CI runs
- **THEN** it cannot read the private log, and the build uses only the public person records

#### Scenario: Permission referenced publicly
- **WHEN** a dataset is re-hosted under written permission
- **THEN** its public record contains `permission_ref: perm-2026-0003` and no other detail of the permission

### Requirement: Public credit changes only by reviewed edits
Public person records SHALL be added or changed only by the maintainer, as a reviewable change to the public repository, and only for people whose recorded consent covers the displayed fields. When consent is withdrawn, the maintainer SHALL remove the person's credit and deploy within 7 days.

#### Scenario: Consent withdrawn
- **WHEN** a researcher withdraws display consent
- **THEN** within 7 days the site shows only bibliographic credit for that researcher

### Requirement: Notice at first contact and recorded consent
The first message to a researcher whose contact details were collected from a public source SHALL include a notice in Mandarin, as 個人資料保護法 第9條 requires. The notice SHALL state the source of the contact details, the collector's identity, the purpose, the data categories, the period, place and manner of use (including that the private log is stored with a US-based service, if so), the person's rights under 第3條, how to exercise them, and that credit placed in DOI metadata cannot be fully withdrawn once minted. Consent to display, or to redistribution, SHALL be recorded with evidence (for example the person's reply email or a signed form) and with the version of the notice or consent form used.

#### Scenario: Outreach email
- **WHEN** the maintainer sends the first outreach email to a researcher found through a university web page
- **THEN** the email contains the current notice, and the private log records which notice version was sent

### Requirement: Rights requests and retention
Requests to inquire, review or copy SHALL be answered within 15 days. Requests to correct, stop processing or delete SHALL be answered within 30 days. Each period MAY be extended once, with notice to the requester. A deletion SHALL remove the person's data from the current private log within 30 days. Copies in history and backups SHALL expire within 3 months, and the requester SHALL be told that date. If the person asks not to be contacted again, only a minimal do-not-contact entry SHALL remain. Contact details SHALL be deleted 24 months after the last unanswered contact. Consent and permission evidence SHALL be kept while the related data remain public, and for 5 years afterwards.

#### Scenario: Deletion request
- **WHEN** a researcher asks for their data to be deleted
- **THEN** within 30 days their entries are removed from the current private log and their public credit is removed, and they are told the date by which backup copies expire
