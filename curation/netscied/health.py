"""The monthly health check (data-curation spec, "Integrity and monthly health
check"). It re-hashes every published file, checks each hosted dataset's upstream
sources for changes (HTTP validators, page checksums, data.gov.tw modification
dates), and checks that every access link still resolves. It returns findings
for a single issue, and never changes a record or a file.
"""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urlencode

from .fetch import FetchError, Fetcher
from .recipes import REPO, load_yaml

VALIDATORS = ("ETag", "Last-Modified", "Content-Length", "Content-MD5")
DATAGOV = re.compile(r"^https://data\.gov\.tw/dataset/(\d+)")
DATAGOV_API = "https://data.gov.tw/api/v2/rest/dataset/"


@dataclass
class Finding:
    kind: str  # published-file | upstream | access-link
    subject: str
    detail: str


@dataclass
class Report:
    today: str
    findings: list[Finding] = field(default_factory=list)
    checked: dict = field(default_factory=lambda: {"files": 0, "sources": 0, "links": 0})


def _semver(v: str):
    return tuple(int(x) for x in v.split("."))


def _get_bytes(fetcher: Fetcher, url: str) -> bytes:
    with fetcher.open(url) as resp:
        return resp.read()


def _sha_stream(fetcher: Fetcher, url: str) -> tuple[str, int]:
    h, n = hashlib.sha256(), 0
    with fetcher.open(url) as resp:
        while chunk := resp.read(1 << 20):
            h.update(chunk)
            n += len(chunk)
    return h.hexdigest(), n


def run_health(*, root: Path = REPO, fetcher: Fetcher, data_base: str = "https://netscied.tw/data", datagov_api: str = DATAGOV_API, today: str) -> Report:
    root = Path(root)
    report = Report(today=today)
    add = lambda kind, subject, detail: report.findings.append(Finding(kind, subject, detail))  # noqa: E731
    records = {p.stem: load_yaml(p) for p in sorted((root / "catalog" / "datasets").glob("*.yaml"))}
    manifests: dict[str, list[dict]] = {}
    for p in sorted((root / "catalog" / "versions").glob("*/*.json")):
        m = json.loads(p.read_text(encoding="utf-8"))
        manifests.setdefault(m["dataset"], []).append(m)
    recipes = {p.stem: load_yaml(p) for p in sorted((root / "curation" / "recipes").glob("*.yaml"))}

    # 1. Re-hash every published file of every live version.
    for did, ms in manifests.items():
        for m in ms:
            if m.get("withdrawn") or m.get("suspended"):
                continue
            for f in m["files"]:
                subject = f"{did} {m['version']} `{f['path']}`"
                report.checked["files"] += 1
                try:
                    digest, n = _sha_stream(fetcher, f"{data_base}/{did}/{m['version']}/{f['path']}")
                except FetchError as e:
                    add("published-file", subject, f"無法下載：{e}")
                    continue
                if digest != f["sha256"] or n != f["bytes"]:
                    add("published-file", subject, f"SHA-256 不符：記錄 {f['sha256'][:16]}…（{f['bytes']} bytes），實際 {digest[:16]}…（{n} bytes）")

    # 2. Upstream sources of each hosted dataset, against its latest live version.
    for did, ms in manifests.items():
        live = [m for m in ms if not m.get("withdrawn")]
        if not live:
            continue
        latest = max(live, key=lambda m: _semver(m["version"]))
        ver = latest["version"]
        prov = {}
        try:
            prov = {s["id"]: s for s in json.loads(_get_bytes(fetcher, f"{data_base}/{did}/{ver}/provenance.json")).get("sources", [])}
        except (FetchError, ValueError):
            pass
        files = {f["path"]: f for f in latest["files"]}
        recipe = recipes.get(did) or {"sources": []}
        for src in recipe.get("sources", []):
            subject = f"{did} {ver} 來源 {src['id']}"
            report.checked["sources"] += 1
            try:
                if src["method"] == "get":
                    _, headers = fetcher.head(src["url"])
                    recorded = (prov.get(src["id"]) or {}).get("headers", {})
                    changed = [f"{k} 由 {recorded[k]} 變為 {headers.get(k)}" for k in VALIDATORS if k in recorded and headers.get(k) != recorded[k]]
                    if changed:
                        add("upstream", subject, "；".join(changed))
                elif src["method"] == "api" and src.get("pagination"):
                    pag = src["pagination"]
                    q = {**(src.get("params") or {}), pag.get("page_param", "page"): 1}
                    if pag.get("size_param"):
                        q[pag["size_param"]] = pag["size"]
                    original = files.get(f"original/{src['id']}/page-0001.json") or files.get("original/page-0001.json")
                    if original:
                        body = _get_bytes(fetcher, src["url"] + "?" + urlencode(q, doseq=True))
                        if hashlib.sha256(body).hexdigest() != original["sha256"]:
                            add("upstream", subject, f"第 1 頁內容與 {ver} 版擷取時不同")
                elif src["method"] == "manual":
                    status, _ = fetcher.head(src["landing_page"])
                    if status >= 400:
                        add("upstream", subject, f"來源頁面回應 HTTP {status}")
            except FetchError as e:
                add("upstream", subject, f"無法檢查：{e}")
        m = DATAGOV.match(((records.get(did) or {}).get("provenance") or {}).get("source", {}).get("url", ""))
        if m:
            report.checked["sources"] += 1
            try:
                meta = json.loads(_get_bytes(fetcher, datagov_api + m.group(1)))
                modified = str((meta.get("result") or {}).get("modifiedDate") or "")[:10]
                if modified and modified > (latest.get("snapshot_date") or ""):
                    add("upstream", did, f"政府資料開放平臺資料集 {m.group(1)} 的詮釋資料更新於 {modified}，晚於 {ver} 版的來源快照日期 {latest.get('snapshot_date')}")
            except (FetchError, ValueError) as e:
                add("upstream", did, f"無法讀取政府資料開放平臺資料集 {m.group(1)} 的詮釋資料：{e}")

    # 3. Access links of every listed dataset.
    for did, r in records.items():
        if r.get("status") not in ("published", "wanted"):
            continue
        urls = [a["url"] for a in (r.get("provenance") or {}).get("access", [])]
        ev = ((r.get("license") or {}).get("evidence") or {}).get("url")
        for url in dict.fromkeys([*urls, *([ev] if ev else [])]):
            report.checked["links"] += 1
            try:
                status, _ = fetcher.head(url)
                if status >= 400:
                    add("access-link", did, f"{url} 回應 HTTP {status}")
            except FetchError as e:
                add("access-link", did, f"{url} 無法連線：{e}")
    return report


SECTIONS = [("published-file", "已發布檔案"), ("upstream", "上游來源"), ("access-link", "存取連結")]


def render(report: Report) -> str:
    c = report.checked
    lines = [
        f"# 每月健康檢查（{report.today}）",
        "",
        "本報告由每月排程自動產生，只列出問題，不修改任何記錄或檔案（data-curation spec, Integrity and monthly health check）。",
        f"檢查了 {c['files']} 個已發布檔案、{c['sources']} 個上游來源、{c['links']} 個存取連結。",
        "",
    ]
    if not report.findings:
        lines.append("沒有發現問題。")
        return "\n".join(lines) + "\n"
    lines.append(f"共 {len(report.findings)} 項發現。")
    for kind, title in SECTIONS:
        items = [f for f in report.findings if f.kind == kind]
        if items:
            lines += ["", f"## {title}", ""] + [f"- {f.subject}：{f.detail}" for f in items]
    return "\n".join(lines) + "\n"
