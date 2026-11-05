# Live AWS state of netscied.tw

What was changed in production, in order, and how to undo each step. All of it
is in account "<ACCOUNT_ID>" (see `aws sts get-caller-identity`).

| Date | Change | Undo |
|---|---|---|
| 2026-11-05 | Saved the original distribution and bucket settings to `rollback/`; the unredacted copies are in the git-ignored `rollback/local/`. | — |
| 2026-11-05 | Created OAC `E2FE01PUODZ8FZ` and the bucket policy in `s3/`. The origin of distribution `E1T4HFQSMO2DUV` became `netscied.tw.s3.ap-northeast-2.amazonaws.com` through that OAC (task 1.2). | Restore `rollback/cloudfront-E1T4HFQSMO2DUV.json`'s origin and delete the bucket policy. |
| 2026-11-05 | S3 Block Public Access on (all four settings) for bucket `netscied.tw` (task 1.3). | `aws s3api delete-public-access-block --bucket netscied.tw` |
| 2026-11-05 | The default cache behavior moved from legacy cache settings to the managed CachingOptimized policy (`658327ea-…`); flat-rate plans refuse legacy settings. | Restore `ForwardedValues` and the TTLs from `rollback/`. |
| 2026-11-05 | WAF web ACL `netscied-tw` (us-east-1, CLOUDFRONT) with one site-wide rule: block an IP above 1,000 requests per 5 minutes (`waf/web-acl-rules.json`), attached to the distribution. The Free plan does not allow byte-match rules, so the rule cannot be scoped to `/data/`. | While on a plan the ACL cannot be removed; cancel the plan first. |
| 2026-11-05 | Price class `PriceClass_200` changed to `PriceClass_All`; the Free plan requires it. | Set it back (only after cancelling the plan). |
| 2026-11-05 | Subscribed the distribution, the web ACL and the Route 53 zone `Z3T8YDA2K0I6BI` to the CloudFront flat-rate **Free** plan (subscription `sub_3LgNISjyBvX9IyS56DCBKnjqVcl`, task 2.6). | `aws pricing-plan-manager cancel-subscription` (Free plans cancel immediately). |

After every step, 25 URLs (the home page, the legacy paths, the old project demos
and the files kept private) answered byte-identically to the snapshot taken
before the first change, with the CloudFront cache cleared each time.

Notes:
- zsh reads `$VAR:s…` as a substitution modifier, so write `${ACCT}:subscription:…`
  when building ARNs in this shell.
- The existing budget "My Monthly Cost Budget" ($5/month) sends the cost alerts (owner decision A9).

## Publishing a version

Dataset files are uploaded only by `.github/workflows/publish.yml`, run from
`main` and approved by the owner (task 8.6). Nothing on a laptop uploads them:
`netscied upload` refuses.

1. The version's manifest, `catalog/versions/<id>/<version>.json`, must be on
   `main`, and its recipe in `curation/recipes/<id>.yaml` must build that version.
2. Start the run, from the Actions tab (**Publish a dataset version** → **Run
   workflow**, branch `main`) or with
   `gh workflow run publish.yml --ref main -f dataset=<id> -f version=<version>`.
3. The run waits for approval in the `publish` environment. Open it (Actions →
   the run → **Review deployments**), check the dataset and version, and approve.
4. The job then:
   - fetches the sources, which must match the recipe's expected hashes;
   - runs `netscied verify`, which rebuilds the version and stops unless every
     file is byte-identical to the committed manifest;
   - assumes the publish role (environment secret `NETSCIED_PUBLISH_ROLE_ARN`);
   - uploads to `s3://$NETSCIED_DATA_BUCKET/data/<id>/<version>/` with
     `scripts/data/publish.mjs` (`SHA256SUMS` last);
   - reads every file back from `https://netscied.tw/data/<id>/<version>/` and
     runs `sha256sum -c`.

A re-run is safe: keys that already hold the same SHA-256 are skipped. If a key
holds different bytes, the run stops before uploading anything. The role cannot
delete, so a published version is never removed by the job; withdrawing one is
the takedown procedure (content-governance spec), done by hand.

The site's deploy (`scripts/deploy.mjs`) refuses while any version file the
pages link does not answer 200, with the manifest's size and not as HTML, so
publish the data before deploying pages that link it.
