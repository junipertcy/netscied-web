#!/usr/bin/env bash
# Post-deploy smoke checks for netscied.tw (tasks.md 1.3, 2.5, 10.2). Read-only: curl only.
#
#   scripts/smoke.sh                    # checks https://netscied.tw
#   BASE=https://dxxxx.cloudfront.net scripts/smoke.sh
#   LOCAL=1 BASE=http://127.0.0.1:4321 scripts/smoke.sh   # against scripts/preview.mjs
#
# Phase 1 expectations: the legacy rows of config/redirects.yaml are on, and the
# machine files carry their content types and CORS (tasks 5.6, 7.2). LOCAL=1
# skips the checks that need the real hosts (www, the S3 endpoints, caching).
set -u

BASE=${BASE:-https://netscied.tw}
WWW=${WWW:-https://www.netscied.tw}
# Redirects always point at the canonical host, even when BASE is a cloudfront.net name.
CANONICAL=${CANONICAL:-https://netscied.tw}
S3_REGION=${S3_REGION:-ap-northeast-2}
S3_BUCKET=${S3_BUCKET:-netscied.tw}
LOCAL=${LOCAL:-0}
failures=0

pass() { printf 'ok    %s\n' "$1"; }
fail() { printf 'FAIL  %s\n' "$1"; failures=$((failures + 1)); }

# status URL EXPECTED [curl flags…]: the status of the first response, or of the last one with -L.
status() {
  local url=$1 expected=$2; shift 2
  local got
  got=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$@" "$url")
  [ "$got" = "$expected" ] && pass "$url → $expected" || fail "$url → $got (expected $expected)"
}

# redirect URL LOCATION: a 301 with exactly this Location.
redirect() {
  local url=$1 expected=$2 out code loc
  out=$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' --max-time 20 "$url")
  code=${out%% *}
  loc=${out#* }
  # curl resolves relative Locations to absolute URLs.
  [ "$code" = 301 ] && [ "$loc" = "$expected" ] && pass "$url → 301 $expected" \
    || fail "$url → $code ${loc:-<no location>} (expected 301 $expected)"
}

# stays_on_site URL: if the response redirects, it redirects to the canonical host.
stays_on_site() {
  local url=$1 loc
  loc=$(curl -s -o /dev/null -w '%{redirect_url}' --max-time 20 --path-as-is "$url")
  case $loc in "" | "$CANONICAL"/*) pass "$url stays on $CANONICAL" ;; *) fail "$url → $loc (redirects off the site)" ;; esac
}

# content_type URL PREFIX: a 200 whose Content-Type starts with PREFIX.
content_type() {
  local url=$1 expected=$2 out code type
  out=$(curl -s -o /dev/null -w '%{http_code} %{content_type}' --max-time 20 "$url")
  code=${out%% *}
  type=${out#* }
  [ "$code" = 200 ] && [ "${type#"$expected"}" != "$type" ] && pass "$url → 200 $type" \
    || fail "$url → $code $type (expected 200 $expected)"
}

# header URL NAME PREFIX: the response carries header NAME starting with PREFIX.
header() {
  local url=$1 name=$2 expected=$3 got
  got=$(curl -s -o /dev/null -D - --max-time 20 "$url" | tr -d '\r' | awk -v n="$(echo "$name" | tr '[:upper:]' '[:lower:]')" 'BEGIN{IGNORECASE=1} tolower($0) ~ "^"n":" {sub(/^[^:]*: */, ""); print; exit}')
  [ "${got#"$expected"}" != "$got" ] && pass "$url $name: $got" || fail "$url $name: ${got:-<missing>} (expected $expected)"
}

# not_public URL: the bucket endpoint returns an error, not the object.
not_public() {
  local url=$1 got
  got=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$url")
  case $got in 403 | 404) pass "$url → $got (bucket not public)" ;; *) fail "$url → $got (bucket readable directly)" ;; esac
}

echo "Smoke checks against $BASE"
status "$BASE/" 200
# A slashless missing path is first given its slash, then answers 404. Checked
# in two steps, because the 301 names the canonical host.
redirect "$BASE/nope" "$CANONICAL/nope/"
status "$BASE/nope/" 404
status "$BASE/does-not-exist/" 404
status "$BASE/.well-known/does-not-exist" 404
redirect "$BASE/mcp" "$CANONICAL/mcp/"
status "$BASE/mcp/" 404
status "$BASE/en/" 404
content_type "$BASE/robots.txt" "text/plain"
content_type "$BASE/sitemap.xml" "application/xml"
content_type "$BASE/llms.txt" "text/plain"
content_type "$BASE/news/feed.xml" "application/atom+xml"
content_type "$BASE/api/v1/index.json" "application/json"
content_type "$BASE/api/v1/datasets.csv" "text/csv"
content_type "$BASE/datasets/golden-horse-2018-nominations/index.md" "text/markdown"
header "$BASE/api/v1/index.json" "Access-Control-Allow-Origin" "*"
status "$BASE/datasets/" 200
status "$BASE/courses/" 200
redirect "$BASE/networks" "$CANONICAL/datasets/"
redirect "$BASE/refs" "$CANONICAL/courses/"
redirect "$BASE/booklet" "$CANONICAL/about/#booklet"
redirect "$BASE/tools" "https://github.com/junipertcy/Network-Code-Repository"
redirect "$BASE/datasets" "$CANONICAL/datasets/"
redirect "$BASE/stat1021/index.html" "$CANONICAL/stat1021/"
stays_on_site "$BASE//evil.example/x"
if [ "$LOCAL" != 1 ]; then
  redirect "$WWW/x" "$CANONICAL/x/"
  header "$BASE/" "Cache-Control" "public, max-age=300"
  not_public "https://s3.$S3_REGION.amazonaws.com/$S3_BUCKET/index.html"
  not_public "http://$S3_BUCKET.s3-website.$S3_REGION.amazonaws.com/"
fi

echo
if [ "$failures" -eq 0 ]; then echo "all checks passed"; else echo "$failures check(s) failed"; fi
exit $((failures > 0))
