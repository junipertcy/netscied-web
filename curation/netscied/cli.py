"""Command-line entry point: `uv run netscied <command> <dataset-id>`.

  fetch     fetch a recipe's sources into build/cache/<id>/<version>/ and check their hashes
  convert   convert the fetched sources and print the statistics
  stats     the same statistics, as JSON only
  manifest  write the version folder build/data/<id>/<version>/ and catalog/versions/<id>/<version>.json
  upload    refused here: uploads run only in the approved publish job (task 8.6)

Nothing here uploads or publishes (data-curation spec, "Human gate on publication").
"""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from . import __version__
from .converters import convert as run_converter
from .fetch import Fetcher, FetchError, fetch_recipe
from .licenses import LicenseRefused, check_recipe
from .recipes import REPO, RecipeError, dataset_record, load_recipe, recipe_path
from .stats import graph_stats, hypergraph_stats
from .version import VersionError, write_version

TAIPEI = timezone(timedelta(hours=8))
PIPELINE_PATHS = ["curation/netscied", "curation/recipes", "curation/inputs", "curation/uv.lock", "curation/pyproject.toml"]


def _recipe(ref: str) -> dict:
    p = Path(ref)
    return load_recipe(p if p.suffix in (".yaml", ".yml") else recipe_path(ref))


def _fetched(recipe: dict, cache: Path) -> tuple[dict, Path]:
    base = cache / recipe["dataset"] / recipe["version"]
    summary_path = base / "fetch.json"
    if not summary_path.is_file():
        raise FetchError(f"{summary_path} is missing; run `netscied fetch {recipe['dataset']}` first")
    summary = json.loads(summary_path.read_text(encoding="utf-8"))
    return summary, base


def _files(summary: dict, base: Path) -> dict:
    return {s["id"]: [base / f for f in s["files"]] for s in summary["sources"]}


def _stats(product) -> dict:
    if product.kind == "graph":
        return {"graph": graph_stats(product.graph, partition=product.partition, weight=product.weight)}
    return {"hypergraph": hypergraph_stats(product.hypergraph)}


def pipeline_info(allow_dirty: bool) -> dict:
    lock = REPO / "curation" / "uv.lock"
    info = {"lock_sha256": hashlib.sha256(lock.read_bytes()).hexdigest()}
    head = subprocess.run(["git", "-C", str(REPO), "rev-parse", "HEAD"], capture_output=True, text=True)
    if head.returncode == 0:
        info["commit"] = head.stdout.strip()
    dirty = subprocess.run(["git", "-C", str(REPO), "status", "--porcelain", "--", *PIPELINE_PATHS], capture_output=True, text=True).stdout.strip()
    if dirty and not allow_dirty:
        raise VersionError("the pipeline has uncommitted changes, so the recorded commit would not reproduce this version; commit them first:\n" + dirty)
    return info


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(prog="netscied", description="netscied.tw curation pipeline")
    parser.add_argument("--version", action="version", version=f"netscied {__version__}")
    sub = parser.add_subparsers(dest="command", required=True)
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("dataset", help="dataset id (curation/recipes/<id>.yaml) or a recipe path")
    common.add_argument("--cache", type=Path, default=REPO / "build" / "cache", help="where fetched sources are kept (git-ignored)")
    for name, help_text in [
        ("fetch", "fetch a recipe's upstream sources and check their hashes"),
        ("convert", "convert fetched sources to the canonical formats and print statistics"),
        ("stats", "print the statistics of a converted version as JSON"),
        ("manifest", "write the version folder, SHA256SUMS, zip, provenance, attribution and manifest"),
        ("upload", "upload an approved version to the data bucket (approval-gated; refused locally)"),
    ]:
        p = sub.add_parser(name, help=help_text, parents=[common])
        if name == "fetch":
            p.add_argument("--no-capture", action="store_true", help="do not ask the Internet Archive to capture landing pages")
            p.add_argument("--no-reuse", action="store_true", help="download again even when the cached file's HTTP validators are unchanged")
        if name == "manifest":
            p.add_argument("--data", type=Path, default=REPO / "build" / "data", help="where version folders are written (git-ignored)")
            p.add_argument("--catalog", type=Path, default=REPO / "catalog", help="catalog root for catalog/versions/")
            p.add_argument("--released", help="release date, YYYY-MM-DD (default: today in Taipei)")
            p.add_argument("--allow-dirty", action="store_true", help="allow uncommitted pipeline changes (tests only)")
            p.add_argument("--force", action="store_true", help="overwrite an existing manifest that is not yet on main")
    args = parser.parse_args(argv)

    try:
        if args.command == "upload":
            print(
                "netscied upload: refused. Uploads run only in the approved `publish` job of the protected GitHub Environment (task 8.6); nothing was uploaded.",
                file=sys.stderr,
            )
            return 2
        recipe = _recipe(args.dataset)
        record = dataset_record(recipe["dataset"])
        if args.command == "fetch":
            check_recipe(recipe, record)
            summary = fetch_recipe(recipe, args.cache, Fetcher(), inputs_dir=REPO / "curation" / "inputs", capture=not args.no_capture, reuse=not args.no_reuse)
            for s in summary["sources"]:
                print(f"{s['id']}: {s['bytes']} bytes, sha256 {s['sha256']}, retrieved {s['retrieved_at']}" + (f", archived {s['archived_landing_page']}" if s.get("archived_landing_page") else ""))
            return 0
        summary, base = _fetched(recipe, args.cache)
        product = run_converter(recipe, _files(summary, base))
        if args.command in ("convert", "stats"):
            print(json.dumps(_stats(product), ensure_ascii=False, indent=2))
            return 0
        if args.command == "manifest":
            target = args.catalog / "versions" / recipe["dataset"] / f"{recipe['version']}.json"
            if target.exists() and not args.force:
                raise VersionError(f"{target} exists; manifests are immutable once published. Use --force only before it reaches main")
            released = args.released or datetime.now(TAIPEI).date().isoformat()
            manifest = write_version(
                recipe=recipe,
                record=record,
                fetch_summary=summary,
                cache_base=base,
                product=product,
                out_dir=args.data,
                catalog_dir=args.catalog,
                released=released,
                pipeline=pipeline_info(args.allow_dirty),
            )
            for f in manifest["files"]:
                print(f"{f['sha256']}  {f['bytes']:>12}  {f['path']}")
            print(f"wrote {target} and {args.data / recipe['dataset'] / recipe['version']}/")
            return 0
    except (RecipeError, FetchError, LicenseRefused, VersionError, KeyError, ValueError) as e:
        print(f"netscied {args.command}: {e}", file=sys.stderr)
        return 1
    return 2  # pragma: no cover


if __name__ == "__main__":
    sys.exit(main())
