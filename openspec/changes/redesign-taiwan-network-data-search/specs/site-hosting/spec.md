## Purpose

Defines how the static site and the hosted dataset files are served: what the HTTP layer guarantees to browsers, crawlers and agents, how storage stays private behind the CDN, how deploys stay safe, and how a personally funded deployment caps its monthly bill.

## ADDED Requirements

### Requirement: Storage is reachable only through the CDN
The buckets that hold site files and dataset files SHALL NOT be publicly readable. All public traffic SHALL go through the site's CDN distribution at `https://netscied.tw`. Direct requests to a bucket's S3 REST or website endpoint SHALL return no object content.

#### Scenario: Direct bucket access is refused
- **WHEN** a client requests a known object through the S3 REST endpoint or the S3 website endpoint instead of `netscied.tw`
- **THEN** the response is an error (403 or 404) and no object content is returned

#### Scenario: CDN access works
- **WHEN** a client requests the same object at `https://netscied.tw/...`
- **THEN** the object is returned with status 200

### Requirement: Correct content types for machine files
The site SHALL serve `/robots.txt` as `text/plain`, `/sitemap.xml` as `application/xml`, `/news/feed.xml` as `application/atom+xml`, every `.json` file as `application/json`, every `.md` file as `text/markdown`, and every `.csv` file as `text/csv`, each with `charset=utf-8` where applicable.

#### Scenario: robots.txt is text
- **WHEN** a client requests `/robots.txt`
- **THEN** the response status is 200 with `Content-Type: text/plain; charset=utf-8`, and the body is the robots policy, not HTML

### Requirement: Edge logic fails open and stays small
The edge function that implements redirects and directory-index resolution SHALL pass the request through unchanged if it encounters an unexpected error, rather than failing the request. It SHALL stay within the platform's code-size limit. It SHALL be covered by tests over every row of the redirect map before each deploy.

#### Scenario: Unexpected input
- **WHEN** the edge function receives a request with a malformed header or query string
- **THEN** the request continues to the origin, and the visitor does not receive a 5xx error

### Requirement: Safe deploys
A site deploy SHALL upload new content-hashed assets before uploading HTML and JSON that reference them. It SHALL keep the previous deploy's hashed assets available, and it SHALL invalidate changed non-hashed paths only after all uploads succeed. A deploy that fails part-way SHALL leave the previously deployed pages working.

#### Scenario: Deploy interrupted
- **WHEN** a deploy fails after uploading assets but before uploading HTML
- **THEN** the site keeps serving the previous HTML, and every asset it references still loads

### Requirement: Dataset files are served from immutable versioned paths
Hosted dataset files SHALL be served under `https://netscied.tw/data/<dataset-id>/<version>/`, where `<version>` is the dataset version as a semantic version string (for example `1.0.0`). A file published at such a path SHALL never change, and SHALL be deleted only under the takedown procedure. These responses SHALL carry `Cache-Control: public, max-age=31536000, immutable`, `Access-Control-Allow-Origin: *`, and a `Content-Disposition: attachment` header whose file name includes the dataset identifier and version. Each version directory SHALL contain a `SHA256SUMS` file covering every file in it.

#### Scenario: Immutable download
- **WHEN** a client downloads `/data/<id>/1.0.0/<id>-1.0.0.graphml` today, and again after version 2.0.0 is released
- **THEN** both downloads are byte-identical and match the SHA-256 published for version 1.0.0

#### Scenario: Programmatic fetch from another origin
- **WHEN** a notebook running on another origin fetches a hosted dataset file
- **THEN** the response includes `Access-Control-Allow-Origin: *`

### Requirement: Cache policy for pages and data
Content-hashed build assets SHALL be served with a one-year immutable cache lifetime. HTML pages, JSON API files, the sitemap, robots.txt and the feed SHALL be served with a browser cache lifetime of at most 5 minutes.

#### Scenario: Fresh catalog after deploy
- **WHEN** a new dataset is published and the deploy completes
- **THEN** within 10 minutes `/datasets/` and `/api/v1/datasets.json` served by the CDN include the new dataset

### Requirement: Bounded monthly cost
The production distribution SHALL use a CDN pricing plan with no per-byte overage charges (the CloudFront flat-rate plan). A billing alert SHALL email the maintainer when the month's forecast cost exceeds a threshold the maintainer sets. Each hosted file SHALL be no larger than a per-file ceiling: 100 MB while the distribution is on the plan with a 100 GB monthly allowance, and 2 GB on larger plans. Files above the ceiling SHALL NOT be uploaded to the site's storage. A request-rate limit on `/data/*` SHALL keep one client from exhausting the monthly allowance and thereby slowing the HTML pages.

#### Scenario: Oversized file
- **WHEN** a curated version contains a 300 MB file while the distribution is on the 100 GB plan
- **THEN** the publish step refuses to upload it and tells the maintainer to publish an aggregate, wait for the archival deposit, or raise the plan

#### Scenario: Download flood
- **WHEN** one IP address sends requests far faster than the configured rate (on the Free plan the rule covers the whole site, because Free does not allow scoping a rule to `/data/`)
- **THEN** further requests from that address are blocked for a period, and the site keeps serving every other visitor

#### Scenario: Cost alert
- **WHEN** the forecast monthly AWS cost exceeds the configured threshold
- **THEN** the maintainer receives an email alert

### Requirement: Logging is minimal and disclosed
If CDN access logs are enabled, they SHALL be kept for at most 90 days and used only for operating the site and for aggregate analysis of search demand, and the privacy notice at `/about/#privacy` SHALL say so. The site SHALL NOT use third-party analytics or advertising trackers.

#### Scenario: Log retention
- **WHEN** a CDN log object becomes older than 90 days
- **THEN** a lifecycle rule deletes it

#### Scenario: No trackers
- **WHEN** any page is loaded
- **THEN** the browser makes no requests to third-party analytics or advertising domains
