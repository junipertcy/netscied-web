"""Task 8.2: fetch methods and politeness rules, against a local HTTP server
(data-curation spec, "Reproducible fetch recipes" and "Evidence of the original source")."""

import hashlib
import json
import subprocess
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

import pytest

from netscied.fetch import (
    USER_AGENT,
    FetchError,
    Fetcher,
    RobotsDisallowed,
    UpstreamChanged,
    capture_landing_page,
    fetch_source,
    listing_digest,
)

BODY = "節點,連結\n1,2\n".encode("utf-8")


class FakeClock:
    """Time that only moves when the fetcher sleeps."""

    def __init__(self):
        self.now = 1000.0
        self.sleeps = []

    def sleep(self, seconds):
        self.sleeps.append(round(seconds, 3))
        self.now += seconds

    def __call__(self):
        return self.now


class Server:
    def __init__(self):
        self.requests = []
        self.flaky = {}  # path -> list of statuses to return before 200
        self.robots = "User-agent: *\nDisallow: /private/\n"
        outer = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def do_GET(self):
                outer.requests.append((self.path, self.headers.get("User-Agent")))
                u = urlparse(self.path)
                if u.path == "/robots.txt":
                    return self._send(200, outer.robots.encode(), "text/plain")
                queue = outer.flaky.get(u.path)
                if queue:
                    status, retry_after = queue.pop(0)
                    self.send_response(status)
                    if retry_after is not None:
                        self.send_header("Retry-After", str(retry_after))
                    self.send_header("Content-Length", "0")
                    self.end_headers()
                    return
                if u.path in ("/data.csv", "/flaky.csv", "/private/x.csv"):
                    return self._send(200, BODY, "text/csv", {"ETag": '"abc"', "Last-Modified": "Mon, 12 Oct 2026 02:45:11 GMT"})
                if u.path == "/api/items":
                    q = parse_qs(u.query)
                    page, limit = int(q["page"][0]), int(q["limit"][0])
                    items = [{"n": i, "fields": q.get("f", [])} for i in range((page - 1) * limit, min(page * limit, 5))]
                    doc = {"total": 5, "total_page": 3, "page": page, "items": items}
                    return self._send(200, json.dumps(doc, ensure_ascii=False).encode(), "application/json")
                if u.path.startswith("/save/"):
                    target = self.path[len("/save/"):]
                    self.send_response(302)
                    self.send_header("Location", f"/web/20261104080000/{target}")
                    self.send_header("Content-Length", "0")
                    self.end_headers()
                    return
                if u.path.startswith("/web/"):
                    return self._send(200, b"<html>archived</html>", "text/html")
                self._send(404, b"", "text/plain")

            def _send(self, status, body, ctype, extra=None):
                self.send_response(status)
                self.send_header("Content-Type", ctype)
                self.send_header("Content-Length", str(len(body)))
                for k, v in (extra or {}).items():
                    self.send_header(k, v)
                self.end_headers()
                self.wfile.write(body)

        self.httpd = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.base = f"http://127.0.0.1:{self.httpd.server_port}"
        threading.Thread(target=self.httpd.serve_forever, kwargs={"poll_interval": 0.05}, daemon=True).start()

    def paths(self):
        return [p for p, _ in self.requests]


@pytest.fixture
def server():
    s = Server()
    yield s
    s.httpd.shutdown()


@pytest.fixture
def clock():
    return FakeClock()


def fetcher(clock, **kw):
    return Fetcher(sleep=clock.sleep, clock=clock, **kw)


def source(url, **kw):
    return {"id": "s1", "method": "get", "url": url, "landing_page": url, "license_evidence": {"url": url, "checked_on": "2026-11-04"}, **kw}


def test_get_saves_the_bytes_identifies_itself_and_records_headers(server, clock, tmp_path):
    res = fetch_source(source(server.base + "/data.csv"), tmp_path, fetcher(clock))
    assert res.files[0].read_bytes() == BODY
    assert res.sha256 == hashlib.sha256(BODY).hexdigest()
    assert res.bytes == len(BODY)
    assert res.headers["ETag"] == '"abc"'
    assert res.retrieved_at.endswith("Z")
    ua = {a for _, a in server.requests}
    assert ua == {USER_AGENT}
    assert "https://netscied.tw/" in USER_AGENT


def test_a_hash_mismatch_fails_as_an_upstream_change_and_keeps_no_file(server, clock, tmp_path):
    src = source(server.base + "/data.csv", expected={"sha256": "0" * 64, "bytes": len(BODY)})
    with pytest.raises(UpstreamChanged) as e:
        fetch_source(src, tmp_path, fetcher(clock))
    assert "s1" in str(e.value) and "0" * 12 in str(e.value)
    assert not any(p.is_file() for p in tmp_path.rglob("*"))


def test_a_matching_expected_hash_passes(server, clock, tmp_path):
    src = source(server.base + "/data.csv", expected={"sha256": hashlib.sha256(BODY).hexdigest(), "bytes": len(BODY)})
    assert fetch_source(src, tmp_path, fetcher(clock)).bytes == len(BODY)


def test_429_with_retry_after_backs_off_then_succeeds(server, clock, tmp_path):
    server.flaky["/flaky.csv"] = [(429, 7), (429, 7)]
    res = fetch_source(source(server.base + "/flaky.csv"), tmp_path, fetcher(clock))
    assert res.bytes == len(BODY)
    assert clock.sleeps.count(7) == 2
    assert server.paths().count("/flaky.csv") == 3


def test_503_without_retry_after_backs_off_exponentially(server, clock, tmp_path):
    server.flaky["/flaky.csv"] = [(503, None), (503, None), (503, None)]
    fetch_source(source(server.base + "/flaky.csv"), tmp_path, fetcher(clock, backoff_base=2))
    waits = [s for s in clock.sleeps if s >= 2]
    assert waits[:3] == [2, 4, 8]


def test_the_fetcher_gives_up_after_its_retries(server, clock, tmp_path):
    server.flaky["/flaky.csv"] = [(503, 1)] * 10
    with pytest.raises(FetchError, match="503"):
        fetch_source(source(server.base + "/flaky.csv"), tmp_path, fetcher(clock, max_retries=3))
    assert server.paths().count("/flaky.csv") == 4


def test_robots_txt_is_obeyed_and_the_disallowed_path_never_requested(server, clock, tmp_path):
    with pytest.raises(RobotsDisallowed):
        fetch_source(source(server.base + "/private/x.csv"), tmp_path, fetcher(clock))
    assert "/private/x.csv" not in server.paths()
    assert "/robots.txt" in server.paths()


def test_at_most_one_request_per_second_per_host(server, clock, tmp_path):
    f = fetcher(clock)
    fetch_source(source(server.base + "/data.csv"), tmp_path / "a", f)
    fetch_source(source(server.base + "/data.csv"), tmp_path / "b", f)
    # robots.txt, then two data requests: each waits for the one before it.
    assert sum(clock.sleeps) >= 2 - 1e-9


def test_a_crawl_delay_in_robots_txt_stretches_the_interval(server, clock, tmp_path):
    server.robots = "User-agent: *\nCrawl-delay: 3\n"
    f = fetcher(clock)
    fetch_source(source(server.base + "/data.csv"), tmp_path / "a", f)
    before = sum(clock.sleeps)
    fetch_source(source(server.base + "/data.csv"), tmp_path / "b", f)
    assert sum(clock.sleeps) - before >= 3 - 1e-9


def test_api_pagination_saves_each_page_and_hashes_the_listing(server, clock, tmp_path):
    src = source(
        server.base + "/api/items",
        method="api",
        params={"f": ["甲", "乙"]},
        pagination={"page_param": "page", "size_param": "limit", "size": 2, "items": "items"},
    )
    res = fetch_source(src, tmp_path, fetcher(clock))
    assert [p.name for p in res.files] == ["page-0001.json", "page-0002.json", "page-0003.json"]
    items = [i for p in res.files for i in json.loads(p.read_text(encoding="utf-8"))["items"]]
    assert [i["n"] for i in items] == [0, 1, 2, 3, 4]
    assert items[0]["fields"] == ["甲", "乙"]
    assert res.sha256 == listing_digest(res.files)
    assert res.bytes == sum(p.stat().st_size for p in res.files)


def test_git_checks_out_the_pinned_commit(tmp_path, clock):
    repo = tmp_path / "upstream"
    repo.mkdir()
    git = lambda *a: subprocess.run(["git", "-C", str(repo), *a], check=True, capture_output=True, text=True).stdout.strip()  # noqa: E731
    git("init", "-q")
    git("config", "user.email", "t@example.org")
    git("config", "user.name", "t")
    (repo / "data").mkdir()
    (repo / "data" / "g.csv").write_text("first\n", encoding="utf-8")
    git("add", ".")
    git("commit", "-qm", "one")
    first = git("rev-parse", "HEAD")
    (repo / "data" / "g.csv").write_text("second\n", encoding="utf-8")
    git("commit", "-qam", "two")
    src = {"id": "s1", "method": "git", "url": repo.as_uri(), "ref": first, "path": "data/g.csv", "landing_page": "https://example.org/", "license_evidence": {"url": "https://example.org/", "checked_on": "2026-11-04"}}
    res = fetch_source(src, tmp_path / "out", fetcher(clock))
    assert res.files[0].read_text(encoding="utf-8") == "first\n"
    with pytest.raises(FetchError):
        fetch_source({**src, "ref": "0" * 40}, tmp_path / "out2", fetcher(clock))


class NoNetwork:
    def open(self, *a, **k):
        raise AssertionError("a manual source must never touch the network")


def test_manual_sources_are_verified_never_fetched(tmp_path, clock):
    inputs = tmp_path / "inputs"
    (inputs / "d").mkdir(parents=True)
    (inputs / "d" / "f.csv").write_bytes(BODY)
    src = {"id": "s1", "method": "manual", "steps": {"zh-Hant": "下載"}, "file": "d/f.csv", "landing_page": "https://example.org/", "license_evidence": {"url": "https://example.org/", "checked_on": "2026-11-04"}, "expected": {"sha256": hashlib.sha256(BODY).hexdigest(), "bytes": len(BODY)}, "retrieved_at": "2026-11-04"}
    f = fetcher(clock, opener=NoNetwork())
    res = fetch_source(src, tmp_path / "out", f, inputs_dir=inputs)
    assert res.files[0].read_bytes() == BODY
    assert res.retrieved_at == "2026-11-04"
    with pytest.raises(UpstreamChanged):
        fetch_source({**src, "expected": {"sha256": "1" * 64, "bytes": 3}}, tmp_path / "out2", f, inputs_dir=inputs)
    with pytest.raises(FetchError, match="expected"):
        fetch_source({k: v for k, v in src.items() if k != "expected"}, tmp_path / "out3", f, inputs_dir=inputs)


def test_landing_page_capture_records_the_archive_url(server, clock):
    f = fetcher(clock)
    url = capture_landing_page(f, "https://example.org/dataset/1", endpoint=server.base + "/save/")
    assert url == server.base + "/web/20261104080000/https://example.org/dataset/1"


def test_a_failed_capture_returns_none_instead_of_failing_the_fetch(server, clock):
    server.flaky["/save/https://example.org/x"] = [(503, 1)] * 10
    f = fetcher(clock, max_retries=1)
    assert capture_landing_page(f, "https://example.org/x", endpoint=server.base + "/save/") is None


def test_fetch_recipe_writes_fetch_json_and_captures_each_landing_page_once(server, clock, tmp_path):
    from netscied.fetch import fetch_recipe

    page = "https://example.org/landing"
    recipe = {"dataset": "d", "version": "1.0.0", "sources": [source(server.base + "/data.csv", id="a", landing_page=page), source(server.base + "/data.csv", id="b", landing_page=page)]}
    summary = fetch_recipe(recipe, tmp_path, fetcher(clock), archive_endpoint=server.base + "/save/")
    assert [s["archived_landing_page"] for s in summary["sources"]] == [server.base + "/web/20261104080000/" + page] * 2
    assert sum(1 for p in server.paths() if p.startswith("/save/")) == 1
    on_disk = json.loads((tmp_path / "d" / "1.0.0" / "fetch.json").read_text(encoding="utf-8"))
    assert on_disk["sources"][0]["files"] == ["sources/a/data.csv"]
