> Phases follow design.md D13. Phase 0a and 0b can ship before any redesign work. Work deferred to follow-up changes (`add-archive-and-outreach`, `add-mcp-server`, `add-search-endpoint`) is not listed here. Owner decisions are recorded in design.md § Decisions record.

## 1. Phase 0a: close the public bucket

- [ ] 1.1 Owner: in the Billing console, confirm the account is not "using AWS Free Tier"; save the distribution config and the bucket-website config to `infra/rollback/`. Verify: both files are committed, and contain no secrets.
- [ ] 1.2 Create an OAC and a bucket policy for the distribution. Switch the origin from the S3 website endpoint to the REST endpoint through OAC, keeping the current error mapping. Verify: `https://netscied.tw/` and `/networks` still return 200.
- [ ] 1.3 Turn on S3 Block Public Access on `netscied.tw`; add lifecycle rules (noncurrent versions 30 days); add an AWS Budgets forecast alert. Verify: the S3 REST and website endpoint URLs for `index.html` return 403 or 404; the budget lists an email subscriber.

## 2. Phase 0b: real HTTP semantics

- [x] 2.1 Add a concrete `404` route rendering `NotFound` with `noindex`; keep `**` for client navigation. Verify: `pnpm build` writes `browser/404/index.html`.
- [x] 2.2 Add `robots.txt`: allow-all, including AI-training crawlers (owner decision Q4), no `/search/` disallow, and a `Sitemap:` line. Add a build-generated `sitemap.xml`. Verify: both files are in the build output; a robots parser test allows OAI-SearchBot on `/datasets/`.
- [x] 2.3 Write `infra/cloudfront/viewer-request.js`: www→apex, the redirect map from `config/redirects.yaml` (host and slash rules only in Phase 0), trailing-slash 301, `index.html` 301, directory-index rewrite; try/catch pass-through; under 10 KB. Write Node unit tests. Verify: tests cover every redirect-table row, malformed input passes through, `?q=金馬` survives, and the size check passes.
- [ ] 2.4 Write a deploy script (or CI job) that uploads hashed assets first, then HTML and JSON with the cache headers from the site-hosting spec, then invalidates. Verify: a dry run against a test bucket shows the order; an interrupted run leaves the old pages working.
- [ ] 2.5 Publish the Function; deploy the prerendered rebuild; replace the error responses with 403/404 → `/404/index.html` (status 404); invalidate. Verify: `scripts/smoke.sh` shows `/nope` → 404, `/robots.txt` → `text/plain`, `https://www.netscied.tw/x` → 301 to the apex, and `/networks` → 301 `/networks/` → 200.
- [ ] 2.6 Subscribe to the CloudFront flat-rate Free plan and attach the Route 53 zone (owner decision Q2). Add a WAF rate-based rule on `/data/*`; confirm that the default rules do not challenge the crawler user agents listed in the agent-access spec, and that custom error responses and the rate rule are available on the plan (fallbacks in design Risks). Verify: the plan is active; `curl -A` with each listed user agent returns 200 on `/datasets/` (or `/` before Phase 1).

## 3. Content model and validation

- [ ] 3.1 Set up test tooling (a unit test runner, Playwright, axe-core) with pinned versions. Verify: `pnpm test` runs one sample test of each kind in CI.
- [x] 3.2 Add `schemas/v1/` (dataset record, version manifest, person, course, news, recipe), starting from the tested prototype in research, updated to design D3: the personal-data levels none/public-role/private-individuals/sensitive with `reviewed_on`, `p-` + 8 Crockford base32 person ids, and `/data/` URLs on the apex. Verify: ajv 2020 compiles them, and a fixture suite of good and deliberately bad records passes.
- [x] 3.3 Add `catalog/vocab/` (9 domains with crosswalks, tags, licenses with class mapping, formats, concepts) and `catalog/ids.lock`. Verify: the vocabulary files validate.
- [x] 3.4 Implement `scripts/catalog/validate.mjs`. Rules: schema; file name = id; unique ids; `ids.lock` coverage; SPDX membership (pinned list); person references; link-only versus hosted; license class versus redistribution basis; personal-data rules including `reviewed_on`; manifest immutability against `origin/main`; PII regex scan; warnings for recommended fields. Verify: each rule has a failing fixture, and `pnpm catalog:validate` exits non-zero on each.
- [x] 3.5 Implement `scripts/catalog/build.mjs`, which writes the generated catalog for Angular and `/api/v1/*` (index with CC0 metadata license, datasets, courses, wanted, taxonomy, catalog, CSVs, schemas) into a build directory. Verify: snapshot tests; `/api/v1/index.json` lists every file.
- [ ] 3.6 Wire validate → build → search gold set → `ng build` into `pnpm build`. Add a CI workflow for every PR and a monthly scheduled rebuild and deploy, both with `fetch-depth: 0` (the sitemap's page dates need full history, and the build refuses a shallow clone). Verify: a PR with an invalid record fails CI; the scheduled run appears in Actions.
- [ ] 3.7 Add GitHub Issue Forms (推薦資料集, 徵求資料集, 回報問題), with a banner sending takedowns to email, and a PR template checklist (license evidence, Taiwan basis, personal-data review). Create the Google Form for data requests and suggestions (no account needed; optional email; a 個資 notice line) with a prefill parameter for the query, and set an auto-reply on hi@netscied.tw (owner decision Q5). Verify: the issue forms validate against the schemastore issue-forms schema; a prefilled form link opens with the query filled in; a test email receives the auto-reply.

## 4. Seed content

- [x] 4.1 Rebuild the 金馬獎 2018 network from the official nominee announcement as `own-work` (CC BY 4.0), level `public-role`, titled 第55屆金馬獎入圍者–電影網絡, unless the owner confirms rights to the existing JSON. Verify: validation passes; the page shows the personal-data notice; the manifest reports any repeated pairs.
- [ ] 4.2 Add TWNIC as `link-only` to map.twnic.tw, and note the permission request in the private log. Verify: no hosted files; the access link resolves.
- [x] 4.3 Add the 7 wanted records (課業諮詢網絡, 人口遷徙, 港口貿易, 生物食物鏈, 縣市路網, 航空路線, 文獻引用網絡). Verify: `/wanted/` lists exactly 7 rows.
- [ ] 4.4 Add at least 6 more published records from the research seed list, at least 2 of them to be hosted (the 立法院 co-sponsorship hypergraph from LYAPI under CC BY 4.0; a monthly aggregate of Taipei MRT OD flows under OGDL-Taiwan-1.0); the others may be link-only (for example the DGBAS input–output table, county-level migration, CPBL games). Verify: at least 8 published records; every license has an evidence URL and a check date.
- [x] 4.5 Add at least 15 Taiwan course records with offerings, evidence URLs and verification dates, plus the NCKU STAT1021 historical record; move the foreign `/refs` entries into the international list. Apply the four-category inclusion rule (owner decision Q8). Verify: validation passes; the international entries are absent from `/api/v1/courses.json`.
- [x] 4.6 Migrate the 4 news items to `content/news/` and write the relaunch item. Verify: `/news/` shows 5 items, newest first, with stable anchors.
- [x] 4.7 Put the booklet PDFs under `public/files/` if the owner provides them, or link to labelled archived copies. On the STAT1021 page, keep every existing link, including the 2018 class questionnaire, its data and the `networkie` repository (owner decision 2026-11-04: published with the participants' consent), and keep the class files in `public/`; link the Clauset slides to the original instead of a modified copy. Verify: `/about/#booklet` links return 200; `/stat1021/` keeps the class links and hosts no third-party slides.

## 5. Pages and navigation

- [x] 5.1 Replace the navigation with 資料集 · 課程 · 消息 · 關於; add header search on inner pages; add footer links (contribute, takedown, contact) and `lang="zh-Hant-TW"`; enable `TrailingSlashPathLocationStrategy`. Verify: a shell unit test; every internal link in the prerendered HTML ends in `/`.
- [x] 5.2 Build the home page: search form, count line, 3 latest news, and example chips, each omitted with a warning if it returns nothing. Verify: a fixture with an empty catalog builds and shows 0 and no chips.
- [x] 5.3 Build `/datasets/`: prerendered table, sort buttons after hydration, cards below 40em, JSON and CSV links, `DataCatalog` JSON-LD. Verify: the no-JS HTML contains one `<tr>` per published dataset and no sort buttons.
- [x] 5.4 Build `/datasets/<id>/` in the dataset-catalog spec's section order, with `Dataset` JSON-LD, `rel=alternate` JSON, and a visible `index.md` link. Build tombstones for withdrawn records and redirect pages for aliases. Verify: a schema.org validator passes a hosted and a link-only fixture; a withdrawn fixture renders its reason with no downloads.
- [x] 5.5 Build `/wanted/` (including 已收錄 rows), `/courses/` (table, inclusion note, `#international`, ISAC 顯名聲明 when used), `/courses/<id>/` (offerings, freshness label, `Course` and `CourseInstance` JSON-LD), `/news/`, `/about/` (every anchor in the site-structure spec, including the takedown, privacy and disclaimer texts and the CC0 metadata statement), and `/stat1021/` with its archive banner and a link to its course record, its 2018 links unchanged. Verify: page tests check the required sections and anchors.
- [x] 5.6 Remove the `tools` and `booklet` pages and the home essay; add `redirectTo` routes; enable the legacy rows of `config/redirects.yaml` for the Phase 1 deploy. Verify: Function tests show `/networks` → `/datasets/`, `/refs` → `/courses/`, `/booklet` → `/about/#booklet`, `/tools` → GitHub.
- [x] 5.7 Accessibility pass: labels, a `role="status"` result count, focus, contrast, 24 px targets, `lang="en"` sections. Verify: axe-core reports no WCAG 2.2 AA violations on the home, search, table and detail pages.

## 6. Search

- [x] 6.1 Implement `search/` in TypeScript: NFKC, lowercase, corpus-cut T→S fold map, 網絡≡網路, Bopomofo and filler stripping, 100-character truncation, bigram + Latin tokenizer, MiniSearch with field boosts, the 4 query rules, published-only filter, facet counts. Verify: unit tests for each rule, including a hostile-query test.
- [x] 6.2 Generate the fold map and concept aliases at build time; enforce the 150 KB gz budget. Verify: an oversized fixture fails the build with the budget message.
- [x] 6.3 Build `/search/`: native GET form with radio toggle, query read after hydration, results with badges, cross-type hint, wanted group, dataset and course empty states with prefilled and encoded links, load-failure message, `noindex`, and a `<noscript>` block with the dataset list. Verify: Playwright tests for `?q=人口遷徙`, `?q=`, an over-long query, a blocked `catalog.json`, and JS disabled; no hydration errors in the console.
- [ ] 6.4 IME tests: a Playwright script that dispatches composition events and Enter, and manual checks on macOS Zhuyin, Android Gboard Zhuyin and iOS Safari. Verify: exactly one search runs, on the committed text; manual results are recorded in the PR.
- [x] 6.5 Write `catalog/search-gold.yaml` (at least 20 queries with expected and forbidden ids) and `scripts/search-eval.mjs` (top-5 assertions, script/臺台/full-width invariance, unpublished ids skipped). Verify: CI fails when a forbidden fixture result is injected, and passes when an expected id is withdrawn.

## 7. Machine access

- [x] 7.1 Emit the `index.md` siblings, `llms.txt`, the sitemap with record `lastmod`, and the Atom feed (20 newest, or all if fewer), with `rel=alternate` on every page. Generate a news item on first publication (suppressible). Verify: the feed validates as Atom; the sitemap excludes `/search/` and `/404/`; a fixture moving from wanted to published produces exactly one news entry.
- [ ] 7.2 Configure response headers: CORS for `/api/*` and `/data/*`; content types set at upload for `.md`, `.json`, `.csv` and `.xml`. Verify: smoke checks of the headers.
- [ ] 7.3 Verify the domain in Google Search Console and Bing Webmaster Tools (Route 53 TXT records), submit the sitemap, and add an IndexNow ping to the deploy. Verify: both consoles show the sitemap as read.
- [x] 7.4 Agent readability: `curl` each page type, convert it to Markdown, and check that the key facts fall within the first 100k characters. Verify: a script asserts that the title, license and downloads appear in the converted text.

## 8. Minimum curation pipeline

- [ ] 8.1 Create `curation/` with `pyproject.toml` and `uv.lock` (networkx, xgi, frictionless, pyyaml) and a CLI `netscied` with `fetch`, `convert`, `stats`, `manifest` and `upload` subcommands. Verify: `uv run netscied --help` works in CI.
- [x] 8.2 Implement the recipe schema and the fetch methods `get`, `api`, `git` and `manual`, with the politeness rules, expected-hash checks, and Internet Archive landing-page capture. Verify: tests against a local HTTP server, including 429 backoff and hash-mismatch failure.
- [x] 8.3 Implement the converters needed at launch: graph → csv-bundle + datapackage + GraphML, and hypergraph → HIF. Add round-trip and schema checks (the official HIF schema; Frictionless validate). Verify: fixtures round-trip with equal counts and attributes.
- [x] 8.4 Implement stats per kind, the manifest writer, `SHA256SUMS`, a zip of all files, `provenance.json`, and a bilingual `ATTRIBUTION.txt` that includes the OGDL 顯名聲明. Verify: a rebuild from the same inputs gives byte-identical canonical files, and the zip contains `ATTRIBUTION.txt`.
- [x] 8.5 Implement the license-class mapping and its enforcement (no-derivatives limits, share-alike mixing refusal, link-only refusal to host, personal-data override). Verify: unit tests for each.
- [ ] 8.6 Create the private `netscied-data` bucket in ap-east-2 (OAC; a `/data/*` behavior with the managed SimpleCORS policy; Cache-Control and Content-Disposition as object metadata). Add an Actions `publish` job in a protected Environment with a required reviewer, enforcing the per-file ceiling. Verify: an unapproved run cannot upload; a 300 MB fixture is refused; an approved upload is reachable at `/data/<id>/<version>/` and passes `sha256sum -c SHA256SUMS`.
- [ ] 8.7 Add the monthly health workflow (re-hash published files, check upstream sources, check access links → one issue, no edits). Verify: fixture changes for each check appear in a single issue.
- [ ] 8.8 Publish the first 3 hosted versions. Verify: their pages show download tables with checksums, and an agent-style `curl` + `sha256sum -c` passes.

## 9. Private researcher log (minimum)

- [ ] 9.1 Create the private `netscied-people` repo (no Actions, 2FA). Add YAML templates for people, permissions and consents, the Mandarin 第9條 notice and consent form, and the backup procedure (`git bundle | age`, rotation ≤ 3 months), following the split model (owner decision Q1). Verify: a test backup decrypts, and the public repo's CI has no token for it.
- [x] 9.2 Add the public person schema (allowlist; `additionalProperties: false`) and the PII scan to the public validation. Verify: a fixture with an email field fails, and a fixture with a consenting person renders credit on its dataset page.

## 10. Launch and handover

- [ ] 10.1 Check the launch bar: at least 8 published datasets with at least 3 hosted; 7 wanted entries; at least 15 courses; gold set and smoke checks passing. Verify: a checklist in the release PR, all ticked.
- [ ] 10.2 Deploy Phase 1, publish the relaunch news, and check the 2020 site's old URLs in production. Verify: `scripts/smoke.sh` passes, including the legacy redirects.
- [ ] 10.3 Write `docs/maintainer.md`. It covers how to add a dataset, publish a version, refresh courses each semester, handle a takedown, rotate backups and run the quarterly saved searches. It also lists the triggers for the follow-up changes (archive and outreach, search endpoint, semantic search, MCP, Cloudflare flip). Verify: the owner follows it to add one record end to end.

## 11. Phase 0 review follow-ups (2026-11-04)

- [ ] 11.1 Removed site files stay live: deploys never delete, so a file dropped from `public/` or the build keeps serving from the bucket. Add a reviewed prune of non-hashed keys missing from the build (after the HTML upload, before the invalidation, never touching hashed assets), or remove such files by hand at each deploy. Verify: a dry run lists the keys it would delete.
- [x] 11.2 Before task 5.6 enables the legacy redirects, exclude the `from` paths of enabled rows in `config/redirects.yaml` from `sitemap.xml`; Angular prerenders `redirectTo` routes and lists them in `prerendered-routes.json`. Verify: with the rows enabled, the sitemap lists no redirect source.
- [ ] 11.3 Use `request.rawQueryString()` in the edge function, keeping the object loop as the fallback for the vm test harness, so `?debug=` and parameter order survive redirects unchanged. Verify: a test with a raw query string, and `aws cloudfront test-function` at task 2.5.
- [x] 11.4 Skip `index.csr.html` in the deploy.
- [ ] 11.5 `smoke.sh`: check that the 404 body is the not-found page (找不到這個頁面, noindex), and check `Cache-Control` on `/` and on a hashed asset.
- [ ] 11.6 Before the page count reaches the thousands, switch deploy upload groups to glob patterns or the SDK. AWS CLI filters are quadratic (about 6 s for 2,000 files in one group) and `ARG_MAX` is hit at about 14k files per group, which fails safely.
- [ ] 11.7 Decide whether `/404/` itself should answer 404, and whether `/mcp` should skip the trailing-slash rule (the agent-access spec reserves it as a 404; today it gets 301 `/mcp/` → 404).
- [ ] 11.8 Correct the reason in the edge test "uses no module syntax": runtime 2.0 supports `import cf from 'cloudfront'`; the real constraint is that the function must stay runnable in the vm harness.

## 12. Milestone A review follow-ups (2026-11-04)

- [ ] 12.1 Adding a DOI to a manifest that had no `doi` key fails the immutability check (validate.mjs; the fixture's `doi: null` hides it). Verify: a fixture manifest without `doi` gains one and validates.
- [ ] 12.2 Reject person records that hold `orcid` or `homepage` without listing them in `display`. Verify: a failing fixture.
- [x] 12.3 Cross-check `alias` lines of `ids.lock` against the records' `aliases`. Verify: a fixture with a stray alias line fails.
- [ ] 12.4 Add a small-cell rule for hosted aggregates (`small_cell_threshold`), for example taipei-metro-od-monthly. Verify: a fixture aggregate below the threshold fails.
- [ ] 12.5 Reject non-neutral Taiwan naming in `coverage.spatial` (for example 中國臺灣). Verify: a failing fixture.
- [ ] 12.6 Require `license.statement` on published link-only records. Verify: a failing fixture.
- [ ] 12.7 `networking` alone is too broad a computer-networking trigger (`social networking` returns 0 courses). Verify: a gold query.
- [ ] 12.8 Junk bigrams across spaces between Chinese words (spaces between Han characters are removed before tokenizing). Verify: a test with a two-word query.
- [ ] 12.9 Short tokens (`1`, `co`) match noise; `<script>alert(1)</script>` returns hits. Verify: the hostile query returns none.
- [ ] 12.10 BibTeX authors that are organisations need double braces `{{…}}`. Verify: a BibTeX parser test.
- [ ] 12.11 llms.txt, `markdown_url` and page URLs are referenced before they exist; do not deploy `/api/v1/` before tasks 5.x and 7.1 land. Verify: the release checklist.
- [x] 12.12 Record the source commit of the pinned HIF schema next to the copy. Verify: the file says it.
- [x] 12.13 The GraphML round-trip test compares counts and one attribute only; compare every attribute. Verify: a mutated attribute fails.
- [ ] 12.14 The build snapshot test only freezes output; add assertions on its meaning where it matters. Verify: review.
- [ ] 12.15 The search-core tests bypass the real `concepts.yaml` for records; add tests over the real vocabulary. Verify: review.
- [ ] 12.16 Add an automated release-age guard (pnpm `minimumReleaseAge`, with an exception list for the owner's Angular pins). Verify: a too-new pin fails `pnpm install`.
