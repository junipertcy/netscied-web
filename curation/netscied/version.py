"""One hosted version: the folder published at https://netscied.tw/data/<id>/<version>/
and its manifest catalog/versions/<id>/<version>.json (data-curation spec:
"Integrity", "Immutable semantic versions", "Provenance, attribution and
reproducibility in every version").

The folder holds:
- the canonical files of the structure kind (graph: nodes.csv, edges.csv,
  datapackage.json and <id>-<version>.graphml; hypergraph: <id>-<version>.hif.json);
- original/ — the upstream files byte for byte, when the recipe asks for it;
- provenance.json and a bilingual ATTRIBUTION.txt;
- <id>-<version>.zip — every file above, under a <id>-<version>/ folder;
- SHA256SUMS — every file in the folder except itself (the zip included), so
  `sha256sum -c SHA256SUMS` checks a full download. The zip cannot contain the
  final SHA256SUMS, because SHA256SUMS lists the zip.

Every byte is a function of the recipe, the record, the fetched inputs, the
release date and the pipeline commit: a rebuild gives identical files.
"""

from __future__ import annotations

import hashlib
import json
import platform
import re
import shutil
import zipfile
from dataclasses import dataclass, field
from importlib import metadata
from pathlib import Path

from frictionless import validate as frictionless_validate

from . import __version__
from .formats import Graph, Hypergraph, write_csv_bundle, write_graphml, write_hif
from .licenses import OGDL, check_recipe, license_entry
from .recipes import REPO, load_yaml
from .stats import graph_stats, hypergraph_stats

ORIGIN = "https://netscied.tw"
SITE = {"zh-Hant": "台灣網絡科學教育", "en": "Network Science Education in Taiwan"}
# Design D5: 100 MB per hosted file on the CloudFront Free plan.
CEILING = 100_000_000
KEPT_HEADERS = ("ETag", "Last-Modified", "Content-Type", "Content-Length", "Content-MD5")
LIBRARIES = ("networkx", "xgi", "frictionless", "jsonschema", "pyyaml")
SAFE_PATH = re.compile(r"^[A-Za-z0-9._/-]+$")


class VersionError(ValueError):
    pass


@dataclass
class Product:
    """What a converter returns: the structure, and how to describe it."""

    kind: str
    graph: Graph | None = None
    hypergraph: Hypergraph | None = None
    partition: str | None = None
    weight: str | None = None
    network_type: str = "undirected"
    # Data-driven findings of the conversion (for example how many names were
    # left out), added to the version's change note as {"zh-Hant": ..., "en": ...}.
    notes: list = field(default_factory=list)


def _formats() -> dict:
    return {e["id"]: e for e in load_yaml(REPO / "catalog" / "vocab" / "formats.yaml")}


def _sha(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(1 << 20):
            h.update(chunk)
    return h.hexdigest()


def _lines(text) -> str:
    return "\n".join(line.rstrip() for line in str(text).strip().splitlines())


def _ogdl_statement() -> str:
    template = license_entry(OGDL)["attribution_template"]
    return template.splitlines()[1].strip()


def _citation(record: dict, version: str, released: str) -> str:
    """The same text as the site's citation (scripts/catalog/lib/api.mjs citationFor)."""
    if (record.get("redistribution") or {}).get("basis") == "own-work":
        authors = [f"{SITE['zh-Hant']}（netscied.tw）"]
    else:
        authors = list(dict.fromkeys(c["organization"].get("zh-Hant") or c["organization"].get("en") for c in record.get("creators", []) if c.get("organization")))
        authors = authors or [f"{SITE['zh-Hant']}（netscied.tw）"]
    target = f"{ORIGIN}/datasets/{record['id']}/#v{version}"
    return f"{'、'.join(authors)}（{released[:4]}）。{record['title']['zh-Hant']}（版本 {version}）［資料集］。{SITE['zh-Hant']}。{target}"


def _n(count: int, one: str, many: str) -> str:
    return f"{count} {one if count == 1 else many}"


def _quality_notes(stats: dict) -> tuple[list[str], list[str]]:
    zh, en = [], []
    g = stats.get("graph")
    if g:
        if g.get("repeated_pairs"):
            zh.append(f"資料品質：有 {g['repeated_pairs']} 組節點配對重複出現（共 {g['edges']} 條連結、{g['unique_pairs']} 組不同配對），保留為多重邊，未合併。")
            en.append(f"Data quality: {_n(g['repeated_pairs'], 'node pair is', 'node pairs are')} repeated ({g['edges']} edges, {g['unique_pairs']} distinct pairs); repeated pairs are kept as multi-edges, not merged.")
        if g.get("self_loops"):
            zh.append(f"含 {g['self_loops']} 條自環（起點與終點相同）。")
            en.append(f"Self-loops (source equals target): {g['self_loops']}.")
        if g.get("isolated_nodes"):
            zh.append(f"有 {g['isolated_nodes']} 個孤立節點。")
            en.append(f"Isolated nodes: {g['isolated_nodes']}.")
    h = stats.get("hypergraph")
    if h:
        if h.get("empty_hyperedges"):
            zh.append(f"有 {h['empty_hyperedges']} 條空超邊（沒有成員）。")
            en.append(f"Empty hyperedges: {h['empty_hyperedges']}.")
        if h.get("isolated_nodes"):
            zh.append(f"有 {h['isolated_nodes']} 個孤立節點。")
            en.append(f"Isolated nodes: {h['isolated_nodes']}.")
    return zh, en


def _attribution(record, recipe, version, released, out_license, decision) -> str:
    lic = license_entry(out_license) or {"name": {"zh-Hant": out_license, "en": out_license}, "url": ""}
    title = record["title"]
    src = (record.get("provenance") or {}).get("source") or {}
    own = (record.get("redistribution") or {}).get("basis") == "own-work"
    parts = [
        title["zh-Hant"],
        title.get("en", ""),
        f"版本 Version {version}（{released}）",
        f"{ORIGIN}/datasets/{record['id']}/",
        "",
        "== 授權 License ==",
        f"本版本的檔案依「{lic['name']['zh-Hant']}」釋出：{lic.get('url', '')}",
        f"License of the files in this version: {lic['name'].get('en', out_license)}, {lic.get('url', '')}",
        "",
        "== 資料來源與姓名標示 Sources and attribution ==",
    ]
    if own:
        parts += [
            f"本資料由{SITE['zh-Hant']}（netscied.tw）依公開資料自行整理。",
            f"Compiled by {SITE['en']} (netscied.tw) from public sources.",
        ]
    if (record.get("license") or {}).get("attribution"):
        parts.append(_lines(record["license"]["attribution"]))
    if src:
        publisher = (src.get("publisher") or {}).get("en")
        line = f"Source: {src.get('name', {}).get('en', src.get('name', {}).get('zh-Hant', ''))}" + (f", published by {publisher}" if publisher else "") + f" ({src.get('url', '')})"
        if not own:
            # The upstream license, as the recipe records it per source (the record's license otherwise).
            ids = list(dict.fromkeys(s.get("license") or out_license for s in recipe["sources"]))
            names = [(license_entry(i) or {"name": {"en": i}})["name"].get("en", i) for i in ids]
            line += f", under {'; '.join(names)}"
        parts.append(line + ".")
    parts.append("來源頁面 Source pages:")
    for s in recipe["sources"]:
        parts.append(f"- {s['landing_page']}")
    parts += ["", "== 本站所做的處理 Changes made by this site =="]
    for t in recipe.get("transformations") or [{"zh-Hant": "格式轉換，內容未修改。", "en": "Format conversion only; the content is unchanged."}]:
        parts.append(f"- {_lines(t['zh-Hant'])}")
        if t.get("en"):
            parts.append(f"  {_lines(t['en'])}")
    if decision.labels:
        parts += ["", "標示 Labels: " + "、".join(decision.labels)]
    parts += ["", "== 如何引用 How to cite ==", _citation(record, version, released), ""]
    text = "\n".join(parts)
    if decision.requires_ogdl_statement and _ogdl_statement() not in text:
        raise VersionError(
            f"{record['id']}: an OGDL-Taiwan-1.0 source needs its 顯名聲明 in license.attribution (政府資料開放授權條款 §3(2)): «{_ogdl_statement()}»"
        )
    return text


def _pipeline(pipeline: dict) -> dict:
    libs = {}
    for name in LIBRARIES:
        try:
            libs[name] = metadata.version(name)
        except metadata.PackageNotFoundError:  # pragma: no cover
            pass
    return {"tool": "netscied", "version": __version__, "python": platform.python_version(), "libraries": libs, **pipeline}


def _write_zip(folder: Path, name: str, files: list[str], released: str) -> Path:
    path = folder / f"{name}.zip"
    y, m, d = (int(x) for x in released.split("-"))
    with zipfile.ZipFile(path, "w") as z:
        for rel in sorted(files):
            info = zipfile.ZipInfo(f"{name}/{rel}", date_time=(y, m, d, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            z.writestr(info, (folder / rel).read_bytes(), compresslevel=9)
    return path


def write_version(*, recipe, record, fetch_summary, cache_base, product: Product, out_dir, catalog_dir, released, pipeline) -> dict:
    decision = check_recipe(recipe, record)  # refuses before anything is written
    did, ver = recipe["dataset"], recipe["version"]
    out_license = record["license"]["id"]
    attribution = _attribution(record, recipe, ver, released, out_license, decision)
    stem = f"{did}-{ver}"
    folder = Path(out_dir) / did / ver
    if folder.exists():
        shutil.rmtree(folder)
    folder.mkdir(parents=True)
    formats = _formats()
    entries: list[tuple[str, str, str]] = []  # (path, format, role)

    # Canonical files.
    if product.kind == "graph":
        g = product.graph
        write_graphml(g, folder / f"{stem}.graphml")
        entries.append((f"{stem}.graphml", "graphml", "canonical"))
        lic = license_entry(out_license) or {}
        write_csv_bundle(g, folder, name=did, version=ver, title=record["title"]["zh-Hant"], license_id=out_license, license_url=lic.get("url"), description=(record.get("title") or {}).get("en"))
        report = frictionless_validate(str(folder / "datapackage.json"))
        if not report.valid:
            raise VersionError(f"{did}: datapackage.json does not validate: {report.flatten(['rowNumber', 'fieldName', 'type', 'note'])[:5]}")
        entries += [("nodes.csv", "csv-bundle", "canonical"), ("edges.csv", "csv-bundle", "canonical"), ("datapackage.json", "datapackage", "canonical")]
        stats = {"graph": graph_stats(g, partition=product.partition, weight=product.weight)}
    elif product.kind == "hypergraph":
        h = product.hypergraph
        meta = {"title": record["title"]["zh-Hant"], "title_en": record["title"].get("en"), "version": ver, "license": out_license, "url": f"{ORIGIN}/datasets/{did}/"}
        write_hif(h, folder / f"{stem}.hif.json", metadata={k: v for k, v in meta.items() if v}, network_type=product.network_type)
        entries.append((f"{stem}.hif.json", "hif", "canonical"))
        stats = {"hypergraph": hypergraph_stats(h)}
    else:
        raise VersionError(f"{did}: no canonical format for kind {product.kind!r} yet")

    # Originals, byte for byte, when the recipe asks for them.
    fetched = {s["id"]: s for s in fetch_summary["sources"]}
    for src in recipe["sources"]:
        if not src.get("redistribute_original"):
            continue
        got = fetched[src["id"]]
        many = len(recipe["sources"]) > 1 or len(got["files"]) > 1
        for rel in got["files"]:
            name = Path(rel).name
            target = f"original/{src['id']}/{name}" if many else f"original/{name}"
            if not SAFE_PATH.match(target):
                raise VersionError(f"{did}: original file name {target!r} is not URL-safe; rename it in the recipe or do not redistribute it")
            if any(e[0] == target for e in entries):
                raise VersionError(f"{did}: two originals would be published as {target}")
            (folder / target).parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(Path(cache_base) / rel, folder / target)
            ext = Path(name).suffix.lstrip(".").lower()
            if ext not in formats:
                raise VersionError(f"{did}: no format in the vocabulary for original file {name}")
            entries.append((target, ext, "original"))

    # Provenance.
    sources = []
    for src in recipe["sources"]:
        got = fetched[src["id"]]
        entry = {
            "id": src["id"],
            "method": src["method"],
            **({"url": src["url"]} if src.get("url") else {}),
            "landing_page": src["landing_page"],
            **({"archived_landing_page": got.get("archived_landing_page") or src.get("archived_landing_page")} if (got.get("archived_landing_page") or src.get("archived_landing_page")) else {}),
            "retrieved_at": got["retrieved_at"],
            "sha256": got["sha256"],
            "bytes": got["bytes"],
            **({"license": src["license"]} if src.get("license") else {}),
            "license_evidence": src["license_evidence"],
        }
        headers = {k: got.get("headers", {})[k] for k in KEPT_HEADERS if k in got.get("headers", {})}
        if headers:
            entry["headers"] = headers
        if got.get("commit"):
            entry["commit"] = got["commit"]
        if len(got["files"]) > 1:
            entry["files"] = [Path(f).name for f in got["files"]]
        sources.append(entry)
    snapshot = max(s["retrieved_at"][:10] for s in sources)
    zh_notes, en_notes = _quality_notes(stats)
    zh_notes = [n["zh-Hant"] for n in product.notes] + zh_notes
    en_notes = [n.get("en", "") for n in product.notes] + en_notes
    changelog = dict(recipe.get("changelog") or {"zh-Hant": f"版本 {ver}。"})
    if zh_notes:
        changelog["zh-Hant"] = "".join([changelog["zh-Hant"], *zh_notes])
        changelog["en"] = " ".join([changelog.get("en", ""), *en_notes]).strip()
    pipe = _pipeline(pipeline)
    provenance = {
        "dataset": did,
        "version": ver,
        "released": released,
        "snapshot_date": snapshot,
        "page": f"{ORIGIN}/datasets/{did}/",
        "license": {"id": out_license, **({"url": record["license"]["url"]} if record["license"].get("url") else {})},
        "redistribution_basis": record["redistribution"]["basis"],
        "license_class": decision.cls,
        "sources": sources,
        "pipeline": pipe,
        "operations": recipe.get("operations") or ["convert"],
        "transformations": recipe.get("transformations") or [],
        "statistics": stats,
        "changelog": changelog,
        "citation": _citation(record, ver, released),
    }
    (folder / "provenance.json").write_text(json.dumps(provenance, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (folder / "ATTRIBUTION.txt").write_text(attribution, encoding="utf-8")
    entries += [("ATTRIBUTION.txt", "attribution", "metadata"), ("provenance.json", "provenance", "metadata")]

    zip_path = _write_zip(folder, stem, [e[0] for e in entries], released)
    entries.insert(0, (zip_path.name, "zip", "bundle"))
    for rel, _, _ in entries:
        size = (folder / rel).stat().st_size
        if size > CEILING:
            raise VersionError(f"{did}: {rel} is {size} bytes, over the per-file ceiling of {CEILING} bytes (design D5)")
    sums = "".join(f"{_sha(folder / rel)}  {rel}\n" for rel in sorted(e[0] for e in entries))
    (folder / "SHA256SUMS").write_text(sums, encoding="utf-8")
    entries.append(("SHA256SUMS", "sha256sums", "checksums"))

    files = []
    for rel, fmt, role in entries:
        f = formats[fmt]
        files.append(
            {
                "path": rel,
                "url": f"{ORIGIN}/data/{did}/{ver}/{rel}",
                "bytes": (folder / rel).stat().st_size,
                "sha256": _sha(folder / rel),
                "media_type": f["media_type"],
                "format": fmt,
                "role": role,
                **({"conforms_to": f["conforms_to"]} if f.get("conforms_to") else {}),
            }
        )
    manifest = {
        "dataset": did,
        "version": ver,
        "released": released,
        "snapshot_date": snapshot,
        "changelog": changelog,
        "doi": None,
        "license": out_license,
        "files": files,
        "statistics": stats,
        "computed_by": {k: pipe[k] for k in ("tool", "version", "libraries", "commit", "lock_sha256") if pipe.get(k)},
        "upstream_snapshot": {"sources": [{k: s[k] for k in ("id", "url", "landing_page", "archived_landing_page", "retrieved_at", "sha256", "bytes") if k in s} for s in sources]},
    }
    target = Path(catalog_dir) / "versions" / did / f"{ver}.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return manifest
