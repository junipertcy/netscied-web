"""Task 8.7: the monthly health check (data-curation spec, "Integrity and monthly
health check"): re-hash every published file, check each hosted dataset's
upstream sources, check every access link, and report everything in one issue
body — without changing any record or file."""

import hashlib
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest
import yaml

from netscied.fetch import Fetcher
from netscied.health import render, run_health

GOOD = b"index,id\n0,a\n"
EDGES = b"id,source,target\ne0,a,a\n"


class Site:
    def __init__(self):
        self.routes = {}
        self.robots = b"User-agent: *\nAllow: /\n"
        outer = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def _route(self):
                if self.path == "/robots.txt":
                    return 200, {}, outer.robots
                return outer.routes.get(self.path, (404, {}, b""))

            def do_HEAD(self):
                status, headers, body = self._route()
                self.send_response(status)
                for k, v in headers.items():
                    self.send_header(k, v)
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()

            def do_GET(self):
                status, headers, body = self._route()
                self.send_response(status)
                for k, v in headers.items():
                    self.send_header(k, v)
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

        self.httpd = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.base = f"http://127.0.0.1:{self.httpd.server_port}"
        threading.Thread(target=self.httpd.serve_forever, kwargs={"poll_interval": 0.05}, daemon=True).start()


@pytest.fixture
def site():
    s = Site()
    yield s
    s.httpd.shutdown()


def sha(b):
    return hashlib.sha256(b).hexdigest()


def catalog(tmp_path, site, *, served_edges=EDGES, etag='"v1"', modified="2026-10-15 10:24:02", broken_link=False):
    root = tmp_path / "repo"
    (root / "catalog" / "datasets").mkdir(parents=True)
    (root / "catalog" / "versions" / "d1").mkdir(parents=True)
    (root / "curation" / "recipes").mkdir(parents=True)
    access = site.base + ("/gone" if broken_link else "/landing")
    record = {
        "id": "d1",
        "status": "published",
        "provenance": {"source": {"url": "https://data.gov.tw/dataset/128506"}, "access": [{"url": access, "format": "web"}, {"url": site.base + "/landing", "format": "web"}]},
        "license": {"id": "OGDL-Taiwan-1.0", "evidence": {"url": site.base + "/landing", "checked_on": "2026-11-04"}},
    }
    (root / "catalog" / "datasets" / "d1.yaml").write_text(yaml.safe_dump(record, allow_unicode=True), encoding="utf-8")
    files = [("nodes.csv", GOOD), ("edges.csv", EDGES)]
    manifest = {
        "dataset": "d1",
        "version": "1.0.0",
        "released": "2026-11-05",
        "snapshot_date": "2026-11-05",
        "files": [{"path": p, "url": f"https://netscied.tw/data/d1/1.0.0/{p}", "bytes": len(b), "sha256": sha(b), "media_type": "text/csv", "format": "csv-bundle", "role": "canonical"} for p, b in files],
        "upstream_snapshot": {"sources": [{"id": "raw", "url": site.base + "/upstream.csv", "retrieved_at": "2026-11-05T04:00:00Z", "sha256": "0" * 64, "bytes": 10}]},
    }
    (root / "catalog" / "versions" / "d1" / "1.0.0.json").write_text(json.dumps(manifest), encoding="utf-8")
    recipe = {"dataset": "d1", "version": "1.0.0", "sources": [{"id": "raw", "method": "get", "url": site.base + "/upstream.csv", "landing_page": site.base + "/landing"}]}
    (root / "curation" / "recipes" / "d1.yaml").write_text(yaml.safe_dump(recipe, allow_unicode=True), encoding="utf-8")
    provenance = {"sources": [{"id": "raw", "headers": {"ETag": '"v1"', "Last-Modified": "Mon, 12 Oct 2026 02:45:11 GMT", "Content-Length": "10"}}]}
    site.routes.update(
        {
            "/data/d1/1.0.0/nodes.csv": (200, {}, GOOD),
            "/data/d1/1.0.0/edges.csv": (200, {}, served_edges),
            "/data/d1/1.0.0/provenance.json": (200, {}, json.dumps(provenance).encode()),
            "/upstream.csv": (200, {"ETag": etag, "Last-Modified": "Mon, 12 Oct 2026 02:45:11 GMT"}, b"0123456789"),
            "/landing": (200, {}, b"ok"),
            "/api/v2/rest/dataset/128506": (200, {}, json.dumps({"success": True, "result": {"modifiedDate": modified}}).encode()),
        }
    )
    return root


def fetcher():
    return Fetcher(min_interval=0, sleep=lambda s: None)


def run(root, site):
    return run_health(root=root, fetcher=fetcher(), data_base=site.base + "/data", datagov_api=site.base + "/api/v2/rest/dataset/", today="2026-12-02")


def test_a_healthy_catalog_has_no_findings(tmp_path, site):
    report = run(catalog(tmp_path, site), site)
    assert report.findings == []
    assert "沒有發現問題" in render(report)


def test_every_kind_of_finding_lands_in_one_report_and_nothing_is_changed(tmp_path, site):
    root = catalog(tmp_path, site, served_edges=b"tampered\n", etag='"v2"', modified="2026-11-20 09:00:00", broken_link=True)
    before = {p: p.read_bytes() for p in root.rglob("*") if p.is_file()}
    report = run(root, site)
    kinds = sorted({f.kind for f in report.findings})
    assert kinds == ["access-link", "published-file", "upstream"]
    body = render(report)
    assert body.count("# 每月健康檢查") == 1
    assert "d1 1.0.0 `edges.csv`" in body and "SHA-256" in body
    assert '"v2"' in body  # the changed ETag
    assert "2026-11-20" in body and "128506" in body  # data.gov.tw reports a newer modification date
    assert site.base + "/gone" in body and "404" in body
    assert {p: p.read_bytes() for p in root.rglob("*") if p.is_file()} == before


def test_a_missing_published_file_is_reported(tmp_path, site):
    root = catalog(tmp_path, site)
    del site.routes["/data/d1/1.0.0/nodes.csv"]
    report = run(root, site)
    assert [(f.kind, f.subject) for f in report.findings] == [("published-file", "d1 1.0.0 `nodes.csv`")]
    assert "404" in report.findings[0].detail


def test_withdrawn_versions_are_not_rehashed(tmp_path, site):
    root = catalog(tmp_path, site, served_edges=b"tampered\n")
    m = root / "catalog" / "versions" / "d1" / "1.0.0.json"
    doc = json.loads(m.read_text(encoding="utf-8"))
    doc["withdrawn"] = {"date": "2026-11-20", "reason": {"zh-Hant": "下架"}}
    m.write_text(json.dumps(doc), encoding="utf-8")
    assert not [f for f in run(root, site).findings if f.kind == "published-file"]


def test_an_api_source_is_checked_by_its_first_page_against_the_published_original(tmp_path, site):
    root = catalog(tmp_path, site)
    page = b'{"total": 1, "bills": [1]}'
    recipe = {"dataset": "d1", "version": "1.0.0", "sources": [{"id": "bills", "method": "api", "url": site.base + "/api/bills", "params": {"term": 10}, "pagination": {"page_param": "page", "size_param": "limit", "size": 1000}, "landing_page": site.base + "/landing"}]}
    (root / "curation" / "recipes" / "d1.yaml").write_text(yaml.safe_dump(recipe), encoding="utf-8")
    m = root / "catalog" / "versions" / "d1" / "1.0.0.json"
    doc = json.loads(m.read_text(encoding="utf-8"))
    doc["files"].append({"path": "original/bills/page-0001.json", "url": "https://netscied.tw/data/d1/1.0.0/original/bills/page-0001.json", "bytes": len(page), "sha256": sha(page), "media_type": "application/json", "format": "json", "role": "original"})
    m.write_text(json.dumps(doc), encoding="utf-8")
    site.routes["/data/d1/1.0.0/original/bills/page-0001.json"] = (200, {}, page)
    site.routes["/api/bills?term=10&page=1&limit=1000"] = (200, {}, page)
    assert [f for f in run(root, site).findings if f.kind == "upstream"] == []
    site.routes["/api/bills?term=10&page=1&limit=1000"] = (200, {}, b'{"total": 2, "bills": [1, 2]}')
    found = [f for f in run(root, site).findings if f.kind == "upstream"]
    assert [f.subject for f in found] == ["d1 1.0.0 來源 bills"]
    assert "第 1 頁" in found[0].detail


def test_a_link_robots_txt_forbids_checking_is_listed_as_unchecked_not_as_a_finding(tmp_path, site):
    root = catalog(tmp_path, site, broken_link=True)
    site.robots = b"User-agent: *\nDisallow: /gone\n"
    report = run(root, site)
    assert not [f for f in report.findings if f.kind == "access-link"]
    assert [s.subject for s in report.skipped] == ["d1"]
    body = render(report)
    assert "未能檢查" in body and site.base + "/gone" in body
