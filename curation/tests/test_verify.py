"""Task 8.6: `netscied verify <id> <version>` rebuilds a committed version from the
cached fetch and accepts it only when every file is byte-identical to the
committed manifest; only then is the folder copied to build/data/ for upload."""

import json
import shutil

import pytest

from netscied import verify as v
from netscied.cli import main
from netscied.recipes import REPO

GH = "golden-horse-2018-nominations"


@pytest.fixture
def cache(tmp_path):
    c = tmp_path / "cache"
    assert main(["fetch", GH, "--cache", str(c), "--no-capture"]) == 0
    return c


def test_the_committed_golden_horse_version_rebuilds_byte_identical_and_is_copied(cache, tmp_path):
    data = tmp_path / "data"
    m = v.verify_version(GH, "1.0.0", cache_dir=cache, data_dir=data)
    committed = json.loads((REPO / "catalog" / "versions" / GH / "1.0.0.json").read_text(encoding="utf-8"))
    assert m == committed
    folder = data / GH / "1.0.0"
    assert sorted(str(p.relative_to(folder)) for p in folder.rglob("*") if p.is_file()) == sorted(f["path"] for f in committed["files"])
    for f in committed["files"]:
        assert v.sha256_file(folder / f["path"]) == f["sha256"], f["path"]


def test_the_cli_verifies_and_reports(cache, tmp_path, capsys):
    assert main(["verify", GH, "1.0.0", "--cache", str(cache), "--data", str(tmp_path / "data")]) == 0
    assert "byte-identical" in capsys.readouterr().out


def test_a_tampered_input_fails_and_copies_nothing(cache, tmp_path):
    csv = cache / GH / "1.0.0" / "sources" / "official-nominee-list" / "nominations.csv"
    csv.write_text(csv.read_text(encoding="utf-8").replace(",true,", ",false,", 1), encoding="utf-8")
    with pytest.raises(Exception, match="nominations|fetch.json|expected"):
        v.verify_version(GH, "1.0.0", cache_dir=cache, data_dir=tmp_path / "data")
    assert not (tmp_path / "data").exists()


def test_a_manifest_that_differs_from_the_rebuild_names_the_first_differing_file(cache, tmp_path):
    catalog = tmp_path / "catalog"
    shutil.copytree(REPO / "catalog" / "versions" / GH, catalog / "versions" / GH)
    f = catalog / "versions" / GH / "1.0.0.json"
    m = json.loads(f.read_text(encoding="utf-8"))
    edges = next(x for x in m["files"] if x["path"] == "edges.csv")
    edges["sha256"] = "0" * 64
    f.write_text(json.dumps(m, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    with pytest.raises(v.VerifyError, match="edges.csv"):
        v.verify_version(GH, "1.0.0", cache_dir=cache, data_dir=tmp_path / "data", catalog_dir=catalog, committed=lambda p: True)
    assert not (tmp_path / "data").exists()


def test_a_version_without_a_committed_manifest_is_refused(cache, tmp_path):
    with pytest.raises(v.VerifyError, match="no committed manifest"):
        v.verify_version(GH, "9.9.9", cache_dir=cache, data_dir=tmp_path / "data")
    catalog = tmp_path / "catalog"
    shutil.copytree(REPO / "catalog" / "versions" / GH, catalog / "versions" / GH)
    with pytest.raises(v.VerifyError, match="not committed"):
        v.verify_version(GH, "1.0.0", cache_dir=cache, data_dir=tmp_path / "data", catalog_dir=catalog, committed=lambda p: False)


def test_a_file_over_the_ceiling_is_refused_before_anything_is_rebuilt(cache, tmp_path, monkeypatch):
    monkeypatch.setattr(v, "CEILING", 10_000)
    with pytest.raises(v.VerifyError, match="ceiling"):
        v.verify_version(GH, "1.0.0", cache_dir=cache, data_dir=tmp_path / "data")
    assert not (tmp_path / "data").exists()


def test_ids_and_versions_are_validated(cache, tmp_path):
    for bad_id, bad_ver in [("../etc", "1.0.0"), ("Golden", "1.0.0"), (GH, "1.0"), (GH, "1.0.0; rm -rf /")]:
        with pytest.raises(v.VerifyError, match="id|version"):
            v.verify_version(bad_id, bad_ver, cache_dir=cache, data_dir=tmp_path / "data")
