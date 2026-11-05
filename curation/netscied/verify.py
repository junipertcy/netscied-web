"""`netscied verify <id> <version>` (task 8.6): the gate before an upload.

It rebuilds a committed version from the cached fetch, the same way `manifest`
does but into a temporary directory, and accepts it only when the rebuild is
byte-identical to the committed manifest catalog/versions/<id>/<version>.json:
every file's SHA-256 and size, SHA256SUMS included, and every other field. Only
then is the folder copied to build/data/<id>/<version>/, where the publish job
uploads it from.

The rebuild uses what the version recorded, not the moment of the rebuild: its
release date, the pipeline commit and lockfile hash in computed_by, and the
retrieval times in the recipe (a fresh fetch whose bytes match the recipe's
expected hash is the same retrieval). It refuses to run if the installed
libraries or the lockfile differ from those recorded.
"""

from __future__ import annotations

import copy
import hashlib
import json
import re
import shutil
import subprocess
import tempfile
from importlib import metadata
from pathlib import Path

from .converters import convert
from .fetch import verify_fetched
from .recipes import REPO, dataset_record, load_recipe, recipe_path
from .version import write_version

CEILING = 100_000_000  # design D5: 100 MB per hosted file
ID = re.compile(r"^[a-z0-9][a-z0-9-]*$")
SEMVER = re.compile(r"^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$")


class VerifyError(ValueError):
    pass


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(1 << 20):
            h.update(chunk)
    return h.hexdigest()


def git_committed(path: Path) -> bool:
    """True when path is tracked and its working copy equals HEAD."""
    tracked = subprocess.run(["git", "-C", str(REPO), "ls-files", "--error-unmatch", str(path)], capture_output=True)
    if tracked.returncode:
        return False
    return subprocess.run(["git", "-C", str(REPO), "diff", "--quiet", "HEAD", "--", str(path)], capture_output=True).returncode == 0


def _first_difference(a, b, where="") -> str:
    if type(a) is not type(b):
        return where or "(root)"
    if isinstance(a, dict):
        for k in list(a) + [k for k in b if k not in a]:
            if a.get(k) != b.get(k):
                return _first_difference(a.get(k), b.get(k), f"{where}.{k}" if where else k)
    elif isinstance(a, list):
        for i, (x, y) in enumerate(zip(a, b)):
            if x != y:
                return _first_difference(x, y, f"{where}[{i}]")
        if len(a) != len(b):
            return f"{where} (length)"
    return where or "(root)"


def verify_version(dataset_id: str, version: str, *, cache_dir, data_dir, catalog_dir=None, committed=git_committed) -> dict:
    if not ID.match(dataset_id or ""):
        raise VerifyError(f"dataset id {dataset_id!r} must match {ID.pattern}")
    if not SEMVER.match(version or ""):
        raise VerifyError(f"version {version!r} must be a semantic version like 1.0.0")
    catalog_dir = Path(catalog_dir or REPO / "catalog")
    manifest_path = catalog_dir / "versions" / dataset_id / f"{version}.json"
    if not manifest_path.is_file():
        raise VerifyError(f"{dataset_id} {version}: no committed manifest at {manifest_path}")
    if not committed(manifest_path):
        raise VerifyError(f"{dataset_id} {version}: {manifest_path} is not committed (or differs from HEAD); only committed versions are published")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    for f in manifest["files"]:
        if f["bytes"] > CEILING:
            raise VerifyError(f"{dataset_id} {version}: {f['path']} is {f['bytes']} bytes, over the per-file ceiling of {CEILING} bytes")
    if manifest.get("withdrawn") or manifest.get("suspended"):
        raise VerifyError(f"{dataset_id} {version}: the version is withdrawn or suspended")

    recipe = load_recipe(recipe_path(dataset_id))
    if recipe["version"] != version:
        raise VerifyError(f"{dataset_id}: the recipe builds version {recipe['version']}, not {version}")
    record = dataset_record(dataset_id)

    # The environment must be the one the version recorded.
    recorded = manifest.get("computed_by") or {}
    lock = hashlib.sha256((REPO / "curation" / "uv.lock").read_bytes()).hexdigest()
    if recorded.get("lock_sha256") and recorded["lock_sha256"] != lock:
        raise VerifyError(f"{dataset_id} {version}: curation/uv.lock ({lock}) is not the lockfile the version was built with ({recorded['lock_sha256']})")
    for name, want in (recorded.get("libraries") or {}).items():
        have = metadata.version(name)
        if have != want:
            raise VerifyError(f"{dataset_id} {version}: {name} {have} is installed, the version was built with {want}")

    base = Path(cache_dir) / dataset_id / version
    summary_path = base / "fetch.json"
    if not summary_path.is_file():
        raise VerifyError(f"{dataset_id} {version}: {summary_path} is missing; run `netscied fetch {dataset_id}` first")
    summary = json.loads(summary_path.read_text(encoding="utf-8"))
    verify_fetched(recipe, summary, base)  # cache = fetch.json = the recipe's expected bytes
    # The bytes are the recorded ones, so the retrieval is the recorded one.
    summary = copy.deepcopy(summary)
    by_id = {s["id"]: s for s in recipe["sources"]}
    for s in summary["sources"]:
        if by_id.get(s["id"], {}).get("retrieved_at"):
            s["retrieved_at"] = str(by_id[s["id"]]["retrieved_at"])

    product = convert(recipe, {s["id"]: [base / rel for rel in s["files"]] for s in summary["sources"]})
    with tempfile.TemporaryDirectory(prefix="netscied-verify-") as tmp:
        tmp = Path(tmp)
        rebuilt = write_version(
            recipe=recipe,
            record=record,
            fetch_summary=summary,
            cache_base=base,
            product=product,
            out_dir=tmp / "data",
            catalog_dir=tmp / "catalog",
            released=manifest["released"],
            # In the order cli.pipeline_info builds it: provenance.json keeps key order.
            pipeline={k: recorded[k] for k in ("lock_sha256", "commit") if recorded.get(k)},
        )
        want = {f["path"]: f for f in manifest["files"]}
        got = {f["path"]: f for f in rebuilt["files"]}
        for path, f in want.items():
            g = got.get(path)
            if g is None:
                raise VerifyError(f"{dataset_id} {version}: {path} is in the manifest but the rebuild has no such file")
            if (g["sha256"], g["bytes"]) != (f["sha256"], f["bytes"]):
                raise VerifyError(f"{dataset_id} {version}: {path} differs: the manifest has {f['sha256']} ({f['bytes']} bytes), the rebuild {g['sha256']} ({g['bytes']} bytes)")
        extra = sorted(set(got) - set(want))
        if extra:
            raise VerifyError(f"{dataset_id} {version}: the rebuild has files the manifest does not list: {', '.join(extra)}")
        if rebuilt != manifest:
            raise VerifyError(f"{dataset_id} {version}: the rebuilt manifest differs at {_first_difference(manifest, rebuilt)}")
        folder = tmp / "data" / dataset_id / version
        for f in manifest["files"]:  # what the upload will read
            if sha256_file(folder / f["path"]) != f["sha256"]:
                raise VerifyError(f"{dataset_id} {version}: {f['path']} on disk does not match the manifest")
        target = Path(data_dir) / dataset_id / version
        if target.exists():
            shutil.rmtree(target)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(folder, target)
    return manifest
