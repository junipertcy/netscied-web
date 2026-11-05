"""Fetch methods `get`, `api`, `git` and `manual` (data-curation spec,
"Reproducible fetch recipes" and "Evidence of the original source").

Politeness: every request carries USER_AGENT (with a contact URL), obeys the
host's robots.txt (RFC 9309, including Crawl-delay), waits at least one second
between requests to the same host, and backs off on HTTP 429 and 503 (Retry-After
when given, otherwise exponentially). Downloads stream to a temporary file, are
hashed while they arrive, and are kept only when the recipe's expected SHA-256
and size match. Manual sources are verified, never fetched.
"""

from __future__ import annotations

import base64
import email.utils
import hashlib
import json
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import urllib.robotparser
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import unquote, urlencode, urljoin, urlparse

from . import __version__

USER_AGENT = f"netscied-curation/{__version__} (+https://netscied.tw/about/)"
UA_TOKEN = "netscied-curation"
ARCHIVE_SAVE = "https://web.archive.org/save/"
CHUNK = 1 << 20


class FetchError(RuntimeError):
    pass


class RobotsDisallowed(FetchError):
    pass


class UpstreamChanged(FetchError):
    """The upstream bytes differ from the recipe's expected SHA-256 or size."""


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _retry_after(headers, now: float) -> float | None:
    value = headers.get("Retry-After") if headers else None
    if not value:
        return None
    value = value.strip()
    if value.isdigit():
        return float(value)
    try:
        return max(0.0, email.utils.parsedate_to_datetime(value).timestamp() - now)
    except (TypeError, ValueError):
        return None


class Fetcher:
    def __init__(
        self,
        *,
        user_agent: str = USER_AGENT,
        min_interval: float = 1.0,
        max_retries: int = 5,
        backoff_base: float = 1.0,
        max_backoff: float = 300.0,
        timeout: float = 120.0,
        sleep=time.sleep,
        clock=time.monotonic,
        opener=None,
    ):
        self.user_agent = user_agent
        self.min_interval = min_interval
        self.max_retries = max_retries
        self.backoff_base = backoff_base
        self.max_backoff = max_backoff
        self.timeout = timeout
        self.sleep = sleep
        self.clock = clock
        self.opener = opener or urllib.request.build_opener()
        self._last: dict[str, float] = {}
        self._robots: dict[str, urllib.robotparser.RobotFileParser | None] = {}

    @staticmethod
    def _origin(url: str) -> str:
        u = urlparse(url)
        return f"{u.scheme}://{u.netloc}"

    def _interval(self, origin: str) -> float:
        rp = self._robots.get(origin)
        delay = rp.crawl_delay(UA_TOKEN) if rp else None
        return max(self.min_interval, float(delay or 0))

    def _wait(self, origin: str) -> None:
        last = self._last.get(origin)
        if last is not None:
            gap = self._interval(origin) - (self.clock() - last)
            if gap > 0:
                self.sleep(gap)
        self._last[origin] = self.clock()

    def _request(self, url: str):
        """One request with backoff on 429/503. Returns an open response."""
        origin = self._origin(url)
        for attempt in range(self.max_retries + 1):
            self._wait(origin)
            try:
                return self.opener.open(urllib.request.Request(url, headers={"User-Agent": self.user_agent}), timeout=self.timeout)
            except urllib.error.HTTPError as e:
                status, headers = e.code, e.headers
                e.close()
                if status in (429, 503) and attempt < self.max_retries:
                    delay = _retry_after(headers, time.time())
                    if delay is None:
                        delay = self.backoff_base * (2**attempt)
                    self.sleep(min(self.max_backoff, delay))
                    continue
                raise FetchError(f"{url}: HTTP {status}") from None
            except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
                raise FetchError(f"{url}: {e}") from None
        raise FetchError(f"{url}: gave up")  # pragma: no cover

    def _robots_for(self, origin: str):
        if origin in self._robots:
            return self._robots[origin]
        rp = urllib.robotparser.RobotFileParser()
        self._robots[origin] = None
        try:
            with self._request(origin + "/robots.txt") as resp:
                rp.parse(resp.read().decode("utf-8", "replace").splitlines())
        except FetchError as e:
            # RFC 9309 2.3.1: 4xx means no restrictions; 5xx or no answer means
            # the crawler must assume complete disallow.
            m = re.search(r"HTTP (\d{3})", str(e))
            if m and 400 <= int(m.group(1)) < 500:
                rp.parse([])
            else:
                rp.parse(["User-agent: *", "Disallow: /"])
        self._robots[origin] = rp
        return rp

    def allowed(self, url: str) -> bool:
        if urlparse(url).scheme not in ("http", "https"):
            return True
        return self._robots_for(self._origin(url)).can_fetch(UA_TOKEN, url)

    def open(self, url: str):
        if not self.allowed(url):
            raise RobotsDisallowed(f"{url}: disallowed by robots.txt")
        return self._request(url)

    def download(self, url: str, dest: Path) -> dict:
        """Streams url to dest; returns sha256, md5, bytes and the response headers."""
        dest.parent.mkdir(parents=True, exist_ok=True)
        sha, md5, n = hashlib.sha256(), hashlib.md5(), 0  # noqa: S324 (md5 only to check Content-MD5)
        with self.open(url) as resp, open(dest, "wb") as out:
            headers = {k: v for k, v in resp.headers.items()}
            while chunk := resp.read(CHUNK):
                sha.update(chunk)
                md5.update(chunk)
                out.write(chunk)
                n += len(chunk)
        length = headers.get("Content-Length")
        if length is not None and length.isdigit() and int(length) != n:
            dest.unlink()
            raise FetchError(f"{url}: received {n} bytes, Content-Length says {length}")
        if "Content-MD5" in headers and base64.b64encode(md5.digest()).decode() != headers["Content-MD5"]:
            dest.unlink()
            raise FetchError(f"{url}: the bytes do not match the Content-MD5 header")
        return {"sha256": sha.hexdigest(), "md5": md5.hexdigest(), "bytes": n, "headers": headers}


@dataclass
class SourceResult:
    id: str
    method: str
    files: list[Path]
    sha256: str
    bytes: int
    retrieved_at: str
    url: str | None = None
    landing_page: str | None = None
    archived_landing_page: str | None = None
    headers: dict = field(default_factory=dict)
    md5: str | None = None
    commit: str | None = None

    def to_json(self, base: Path) -> dict:
        d = asdict(self)
        d["files"] = [str(p.relative_to(base)) for p in self.files]
        return {k: v for k, v in d.items() if v not in (None, {}, [])}


def file_sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(CHUNK):
            h.update(chunk)
    return h.hexdigest()


def listing_digest(files, names=None) -> str:
    """The SHA-256 of a multi-file retrieval: of its SHA256SUMS-style listing."""
    names = names or [p.name for p in files]
    listing = "".join(f"{file_sha256(p)}  {name}\n" for p, name in zip(files, names))
    return hashlib.sha256(listing.encode("utf-8")).hexdigest()


def _check_expected(src: dict, sha256: str, n: int, files: list[Path]) -> None:
    exp = src.get("expected")
    if exp and (exp["sha256"] != sha256 or exp["bytes"] != n):
        for p in files:
            p.unlink(missing_ok=True)
        raise UpstreamChanged(
            f"source {src['id']}: upstream changed — expected SHA-256 {exp['sha256']} ({exp['bytes']} bytes), got {sha256} ({n} bytes). "
            "No version is produced; review the change and update the recipe."
        )


def _url_with_params(url: str, params: dict | None) -> str:
    if not params:
        return url
    return url + ("&" if "?" in url else "?") + urlencode(params, doseq=True)


def _fetch_get(src, folder: Path, fetcher: Fetcher):
    name = unquote(Path(urlparse(src["url"]).path).name) or "download"
    part = folder / (name + ".part")
    info = fetcher.download(_url_with_params(src["url"], src.get("params")), part)
    _check_expected(src, info["sha256"], info["bytes"], [part])
    final = folder / name
    part.replace(final)
    return [final], info["sha256"], info["bytes"], {"headers": info["headers"], "md5": info["md5"]}


def _fetch_api(src, folder: Path, fetcher: Fetcher):
    pag = src.get("pagination")
    params = dict(src.get("params") or {})
    files = []
    headers = {}
    if not pag:
        info = fetcher.download(_url_with_params(src["url"], params), folder / "response.json.part")
        files.append(folder / "response.json.part")
        headers = info["headers"]
    else:
        page, max_pages = 1, pag.get("max_pages", 10_000)
        while True:
            q = {**params, pag.get("page_param", "page"): page}
            if pag.get("size_param"):
                q[pag["size_param"]] = pag["size"]
            dest = folder / f"page-{page:04d}.json.part"
            info = fetcher.download(_url_with_params(src["url"], q), dest)
            files.append(dest)
            headers = headers or info["headers"]
            doc = json.loads(dest.read_text(encoding="utf-8"))
            items = doc.get(pag.get("items", "items"), [])
            total_pages = doc.get("total_page")
            done = (total_pages is not None and page >= int(total_pages)) or (total_pages is None and len(items) < pag.get("size", 1)) or not items
            if done:
                break
            if page >= max_pages:
                raise FetchError(f"source {src['id']}: more than max_pages={max_pages} pages")
            page += 1
    final = [p.with_name(p.name.removesuffix(".part")) for p in files]
    sha, n = listing_digest(files, [f.name for f in final]), sum(p.stat().st_size for p in files)
    _check_expected(src, sha, n, files)
    for p, f in zip(files, final):
        p.replace(f)
    return final, sha, n, {"headers": headers}


def _git(*args, cwd=None) -> subprocess.CompletedProcess:
    return subprocess.run(["git", *args], cwd=cwd, capture_output=True, check=False)


def _fetch_git(src, folder: Path, fetcher: Fetcher):
    if not fetcher.allowed(src["url"]):
        raise RobotsDisallowed(f"{src['url']}: disallowed by robots.txt")
    ref, path = src.get("ref"), src.get("path")
    if not ref or not path:
        raise FetchError(f"source {src['id']}: a git source needs ref and path")
    with tempfile.TemporaryDirectory() as tmp:
        fetcher._wait(Fetcher._origin(src["url"]))
        r = _git("clone", "--quiet", "--no-checkout", src["url"], tmp)
        if r.returncode:
            raise FetchError(f"source {src['id']}: git clone failed: {r.stderr.decode(errors='replace').strip()}")
        commit = _git("rev-parse", "--verify", "--quiet", f"{ref}^{{commit}}", cwd=tmp)
        if commit.returncode:
            raise FetchError(f"source {src['id']}: ref {ref} is not a commit in {src['url']}")
        blob = _git("show", f"{ref}:{path}", cwd=tmp)
        if blob.returncode:
            raise FetchError(f"source {src['id']}: {path} not found at {ref}")
    data = blob.stdout
    sha, n = hashlib.sha256(data).hexdigest(), len(data)
    _check_expected(src, sha, n, [])
    dest = folder / Path(path).name
    dest.write_bytes(data)
    return [dest], sha, n, {"commit": commit.stdout.decode().strip()}


def _fetch_manual(src, folder: Path, inputs_dir: Path | None):
    if not src.get("expected"):
        raise FetchError(f"source {src['id']}: a manual source must record its expected SHA-256 and size; jobs only verify it")
    if inputs_dir is None:
        raise FetchError(f"source {src['id']}: no inputs directory for the manual file")
    origin = Path(inputs_dir) / src["file"]
    if not origin.is_file():
        raise FetchError(f"source {src['id']}: {origin} is missing; follow the recipe's steps to download it")
    sha, n = file_sha256(origin), origin.stat().st_size
    _check_expected(src, sha, n, [])
    dest = folder / origin.name
    shutil.copyfile(origin, dest)
    return [dest], sha, n, {}


def fetch_source(src: dict, out_dir, fetcher: Fetcher, *, inputs_dir=None) -> SourceResult:
    folder = Path(out_dir) / src["id"]
    folder.mkdir(parents=True, exist_ok=True)
    method = src["method"]
    retrieved_at = src.get("retrieved_at") if method == "manual" else _now()
    if method == "get":
        files, sha, n, extra = _fetch_get(src, folder, fetcher)
    elif method == "api":
        files, sha, n, extra = _fetch_api(src, folder, fetcher)
    elif method == "git":
        files, sha, n, extra = _fetch_git(src, folder, fetcher)
    elif method == "manual":
        files, sha, n, extra = _fetch_manual(src, folder, inputs_dir)
    else:
        raise FetchError(f"source {src['id']}: unknown method {method!r}")
    if not any(folder.iterdir()):
        folder.rmdir()
    return SourceResult(
        id=src["id"],
        method=method,
        files=files,
        sha256=sha,
        bytes=n,
        retrieved_at=retrieved_at or _now(),
        url=src.get("url"),
        landing_page=src.get("landing_page"),
        archived_landing_page=src.get("archived_landing_page"),
        headers=extra.get("headers") or {},
        md5=extra.get("md5"),
        commit=extra.get("commit"),
    )


_CAPTURE = re.compile(r"/web/\d{14}")


def capture_landing_page(fetcher: Fetcher, url: str, *, endpoint: str = ARCHIVE_SAVE) -> str | None:
    """Asks the Internet Archive to capture url; returns the capture's URL, or None."""
    try:
        with fetcher.open(endpoint + url) as resp:
            final = resp.geturl()
            location = resp.headers.get("Content-Location")
    except FetchError as e:
        print(f"warning: Internet Archive capture of {url} failed: {e}", file=sys.stderr)
        return None
    if _CAPTURE.search(urlparse(final).path):
        return final
    if location and _CAPTURE.search(location):
        return urljoin(final, location)
    print(f"warning: Internet Archive capture of {url} returned no capture URL", file=sys.stderr)
    return None


def fetch_recipe(recipe: dict, cache_dir, fetcher: Fetcher, *, inputs_dir=None, capture: bool = True) -> dict:
    """Fetches every source of a recipe into cache_dir/<dataset>/<version>/sources/
    and writes fetch.json there. Fails on the first upstream change."""
    base = Path(cache_dir) / recipe["dataset"] / recipe["version"]
    sources_dir = base / "sources"
    results = []
    for src in recipe["sources"]:
        res = fetch_source(src, sources_dir, fetcher, inputs_dir=inputs_dir)
        if capture and src["method"] != "manual" and not src.get("archived_landing_page"):
            res.archived_landing_page = capture_landing_page(fetcher, src["landing_page"])
        results.append(res)
    summary = {"dataset": recipe["dataset"], "version": recipe["version"], "sources": [r.to_json(base) for r in results]}
    (base / "fetch.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return summary
