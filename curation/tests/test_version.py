"""Task 8.4: the version folder — canonical files, originals, provenance.json,
ATTRIBUTION.txt, SHA256SUMS, a zip of all files — and its manifest (data-curation
spec: "Integrity", "Provenance, attribution and reproducibility in every version")."""

import hashlib
import json
import zipfile

import pytest

from netscied.formats import Graph, Hypergraph
from netscied.recipes import schema_errors
from netscied.version import Product, VersionError, write_version

OGDL_LINE = "此開放資料依政府資料開放授權條款 (Open Government Data License) 進行公眾釋出，使用者於遵守本條款各項規定之前提下，得利用之。"
RAW = "a,b\n1,2\n".encode("utf-8")


def record(**kw):
    r = {
        "id": "test-graph",
        "title": {"zh-Hant": "測試網絡", "en": "Test network"},
        "license": {
            "id": "OGDL-Taiwan-1.0",
            "url": "https://data.gov.tw/license",
            "attribution": f"測試機關 2026 測試資料\n{OGDL_LINE}\n政府資料開放授權條款：https://data.gov.tw/license",
        },
        "redistribution": {"basis": "license-permits"},
        "personal_data": {"level": "none"},
        "provenance": {"source": {"name": {"zh-Hant": "測試來源", "en": "Test source"}, "url": "https://example.org/", "publisher": {"zh-Hant": "測試機關", "en": "Test Agency"}}},
        "creators": [{"organization": {"zh-Hant": "測試機關", "en": "Test Agency"}, "role": "publisher"}],
    }
    r.update(kw)
    return r


RECIPE = {
    "dataset": "test-graph",
    "version": "1.0.0",
    "changelog": {"zh-Hant": "第一版。", "en": "First version."},
    "operations": ["convert", "aggregate"],
    "transformations": [{"zh-Hant": "依起訖加總。", "en": "Summed per pair."}],
    "coverage": {"temporal": {"start": "2026-09", "end": "2026-09"}},
    "sources": [
        {
            "id": "raw",
            "method": "get",
            "url": "https://example.org/raw.csv",
            "landing_page": "https://example.org/",
            "license": "OGDL-Taiwan-1.0",
            "license_evidence": {"url": "https://example.org/license", "checked_on": "2026-11-04"},
            "redistribute_original": True,
        }
    ],
    "convert": {"converter": "test", "kind": "graph"},
}


def fetched(base):
    (base / "sources" / "raw").mkdir(parents=True, exist_ok=True)
    (base / "sources" / "raw" / "raw.csv").write_bytes(RAW)
    return {
        "dataset": "test-graph",
        "version": "1.0.0",
        "sources": [
            {
                "id": "raw",
                "method": "get",
                "files": ["sources/raw/raw.csv"],
                "sha256": hashlib.sha256(RAW).hexdigest(),
                "bytes": len(RAW),
                "retrieved_at": "2026-11-03T08:00:00Z",
                "url": "https://example.org/raw.csv",
                "landing_page": "https://example.org/",
                "archived_landing_page": "https://web.archive.org/web/20261103080000/https://example.org/",
                "headers": {"ETag": '"x"', "Last-Modified": "Mon, 12 Oct 2026 02:45:11 GMT", "Set-Cookie": "secret"},
            }
        ],
    }


def graph():
    g = Graph(directed=True, node_attrs=["name"], edge_attrs=["trips"])
    g.add_node("s1", name="甲站")
    g.add_node("s2", name="乙站")
    g.add_edge("s1", "s2", trips=10)
    g.add_edge("s2", "s1", trips=4)
    g.add_edge("s1", "s1", trips=1)
    return g


PIPELINE = {"commit": "abc1234", "lock_sha256": "1" * 64}


def build(tmp_path, name, rec=None, product=None, recipe=None):
    base = tmp_path / name / "cache"
    summary = fetched(base)
    return write_version(
        recipe=recipe or RECIPE,
        record=rec or record(),
        fetch_summary=summary,
        cache_base=base,
        product=product or Product(kind="graph", graph=graph(), weight="trips"),
        out_dir=tmp_path / name / "data",
        catalog_dir=tmp_path / name / "catalog",
        released="2026-11-04",
        pipeline=PIPELINE,
    )


def test_a_rebuild_from_the_same_inputs_is_byte_identical(tmp_path):
    a, b = build(tmp_path, "a"), build(tmp_path, "b")
    assert a == b
    files_a = sorted(p.relative_to(tmp_path / "a" / "data") for p in (tmp_path / "a" / "data").rglob("*") if p.is_file())
    assert files_a == sorted(p.relative_to(tmp_path / "b" / "data") for p in (tmp_path / "b" / "data").rglob("*") if p.is_file())
    for rel in files_a:
        assert (tmp_path / "a" / "data" / rel).read_bytes() == (tmp_path / "b" / "data" / rel).read_bytes(), rel


def test_the_version_folder_has_canonical_files_original_metadata_checksums_and_zip(tmp_path):
    m = build(tmp_path, "a")
    paths = {f["path"]: f for f in m["files"]}
    for p in ["nodes.csv", "edges.csv", "datapackage.json", "test-graph-1.0.0.graphml", "original/raw.csv", "provenance.json", "ATTRIBUTION.txt", "SHA256SUMS", "test-graph-1.0.0.zip"]:
        assert p in paths, p
    assert paths["nodes.csv"]["role"] == "canonical"
    assert paths["original/raw.csv"]["role"] == "original"
    assert paths["SHA256SUMS"]["role"] == "checksums"
    assert paths["test-graph-1.0.0.zip"]["role"] == "bundle"
    assert paths["test-graph-1.0.0.zip"]["media_type"] == "application/zip"
    assert all(f["url"] == f"https://netscied.tw/data/test-graph/1.0.0/{f['path']}" for f in m["files"])
    folder = tmp_path / "a" / "data" / "test-graph" / "1.0.0"
    assert (folder / "original" / "raw.csv").read_bytes() == RAW


def test_sha256sums_covers_every_other_file_and_checks_out(tmp_path):
    m = build(tmp_path, "a")
    folder = tmp_path / "a" / "data" / "test-graph" / "1.0.0"
    lines = (folder / "SHA256SUMS").read_text(encoding="utf-8").splitlines()
    listed = {}
    for line in lines:
        digest, name = line.split("  ", 1)
        listed[name] = digest
        assert hashlib.sha256((folder / name).read_bytes()).hexdigest() == digest, name
    assert set(listed) == {f["path"] for f in m["files"]} - {"SHA256SUMS"}
    for f in m["files"]:
        assert f["bytes"] == (folder / f["path"]).stat().st_size
        assert f["sha256"] == hashlib.sha256((folder / f["path"]).read_bytes()).hexdigest()


def test_the_zip_holds_every_file_including_attribution(tmp_path):
    build(tmp_path, "a")
    folder = tmp_path / "a" / "data" / "test-graph" / "1.0.0"
    with zipfile.ZipFile(folder / "test-graph-1.0.0.zip") as z:
        names = z.namelist()
        assert "test-graph-1.0.0/ATTRIBUTION.txt" in names
        assert "test-graph-1.0.0/original/raw.csv" in names
        assert z.read("test-graph-1.0.0/edges.csv") == (folder / "edges.csv").read_bytes()
        assert z.testzip() is None


def test_attribution_is_bilingual_and_carries_the_ogdl_statement(tmp_path):
    build(tmp_path, "a")
    text = (tmp_path / "a" / "data" / "test-graph" / "1.0.0" / "ATTRIBUTION.txt").read_text(encoding="utf-8")
    assert OGDL_LINE in text
    assert "測試機關 2026 測試資料" in text
    assert "Test Agency" in text and "Test source" in text
    assert "授權" in text and "License" in text
    assert "https://netscied.tw/datasets/test-graph/" in text


def test_an_ogdl_source_without_the_statement_is_refused(tmp_path):
    rec = record(license={"id": "OGDL-Taiwan-1.0", "url": "https://data.gov.tw/license", "attribution": "測試機關 2026 測試資料"})
    with pytest.raises(VersionError, match="顯名聲明"):
        build(tmp_path, "a", rec=rec)


def test_provenance_lists_sources_pipeline_and_transformations_without_cookies(tmp_path):
    build(tmp_path, "a")
    prov = json.loads((tmp_path / "a" / "data" / "test-graph" / "1.0.0" / "provenance.json").read_text(encoding="utf-8"))
    s = prov["sources"][0]
    assert s["sha256"] == hashlib.sha256(RAW).hexdigest()
    assert s["archived_landing_page"].startswith("https://web.archive.org/web/")
    assert s["license_evidence"]["checked_on"] == "2026-11-04"
    assert s["headers"] == {"ETag": '"x"', "Last-Modified": "Mon, 12 Oct 2026 02:45:11 GMT"}
    assert prov["pipeline"]["commit"] == "abc1234"
    assert prov["pipeline"]["lock_sha256"] == "1" * 64
    assert prov["transformations"][0]["zh-Hant"] == "依起訖加總。"


def test_the_manifest_validates_reports_statistics_and_notes_quality_findings(tmp_path):
    m = build(tmp_path, "a")
    assert schema_errors("version", m) == []
    on_disk = json.loads((tmp_path / "a" / "catalog" / "versions" / "test-graph" / "1.0.0.json").read_text(encoding="utf-8"))
    assert on_disk == m
    assert m["statistics"]["graph"]["self_loops"] == 1
    assert m["statistics"]["graph"]["total_weight"] == 15
    assert m["snapshot_date"] == "2026-11-03"
    assert "自環" in m["changelog"]["zh-Hant"]
    assert m["computed_by"]["tool"] == "netscied"
    assert m["computed_by"]["commit"] == "abc1234"
    assert m["upstream_snapshot"]["sources"][0]["retrieved_at"] == "2026-11-03T08:00:00Z"


def test_repeated_pairs_are_reported_in_the_change_note(tmp_path):
    g = graph()
    g.add_edge("s1", "s2", trips=3)
    m = build(tmp_path, "a", product=Product(kind="graph", graph=g, weight="trips"))
    assert m["statistics"]["graph"]["repeated_pairs"] == 1
    assert "1 組" in m["changelog"]["zh-Hant"] and "repeated" in m["changelog"]["en"]


def test_a_hypergraph_version_has_a_hif_file(tmp_path):
    h = Hypergraph(node_attrs=["name"], edge_attrs=[], incidence_attrs=["role"])
    h.add_node("m1", name="甲")
    h.add_node("m2", name="乙")
    h.add_edge("b1")
    h.add_incidence("b1", "m1", role="proposer")
    h.add_incidence("b1", "m2", role="cosigner")
    recipe = {**RECIPE, "convert": {"converter": "test", "kind": "hypergraph"}}
    m = build(tmp_path, "a", product=Product(kind="hypergraph", hypergraph=h), recipe=recipe)
    paths = {f["path"]: f for f in m["files"]}
    assert paths["test-graph-1.0.0.hif.json"]["format"] == "hif"
    assert paths["test-graph-1.0.0.hif.json"]["role"] == "canonical"
    assert m["statistics"]["hypergraph"]["incidences"] == 2


def test_a_file_over_the_per_file_ceiling_is_refused(tmp_path, monkeypatch):
    import netscied.version as v

    monkeypatch.setattr(v, "CEILING", 10)
    with pytest.raises(VersionError, match="ceiling"):
        build(tmp_path, "a")


def test_the_license_check_runs_before_anything_is_written(tmp_path):
    rec = record(personal_data={"level": "sensitive"})
    with pytest.raises(Exception, match="personal-data"):
        build(tmp_path, "a", rec=rec)
    assert not (tmp_path / "a" / "data").exists()


def test_own_work_credits_the_site_and_claims_no_upstream_license(tmp_path):
    rec = record(license={"id": "CC-BY-4.0", "url": "https://creativecommons.org/licenses/by/4.0/"}, redistribution={"basis": "own-work"})
    recipe = {**RECIPE, "sources": [{k: v for k, v in RECIPE["sources"][0].items() if k != "license"}]}
    build(tmp_path, "a", rec=rec, recipe=recipe)
    text = (tmp_path / "a" / "data" / "test-graph" / "1.0.0" / "ATTRIBUTION.txt").read_text(encoding="utf-8")
    assert "自行整理" in text and "Compiled by" in text
    source_line = next(line for line in text.splitlines() if line.startswith("Source:"))
    assert " under " not in source_line
    assert "台灣網絡科學教育（netscied.tw）（2026）" in text


def test_converter_notes_are_added_to_the_change_note(tmp_path):
    p = Product(kind="graph", graph=graph(), weight="trips", notes=[{"zh-Hant": "有 3 件議案不收錄。", "en": "3 bills are left out."}])
    m = build(tmp_path, "a", product=p)
    assert "有 3 件議案不收錄。" in m["changelog"]["zh-Hant"]
    assert "3 bills are left out." in m["changelog"]["en"]


def test_originals_of_a_multi_source_recipe_sit_in_one_folder_per_source(tmp_path):
    second = {**RECIPE["sources"][0], "id": "roster"}
    recipe = {**RECIPE, "sources": [RECIPE["sources"][0], second]}
    base = tmp_path / "cache"
    summary = fetched(base)
    (base / "sources" / "roster").mkdir(parents=True)
    (base / "sources" / "roster" / "page-0001.json").write_bytes(b"{}")
    summary["sources"].append({**summary["sources"][0], "id": "roster", "files": ["sources/roster/page-0001.json"], "sha256": hashlib.sha256(b"{}").hexdigest(), "bytes": 2})
    m = write_version(recipe=recipe, record=record(), fetch_summary=summary, cache_base=base, product=Product(kind="graph", graph=graph(), weight="trips"), out_dir=tmp_path / "data", catalog_dir=tmp_path / "catalog", released="2026-11-04", pipeline=PIPELINE)
    paths = {f["path"] for f in m["files"] if f["role"] == "original"}
    assert paths == {"original/raw/raw.csv", "original/roster/page-0001.json"}


def test_fetch_warnings_are_kept_in_provenance(tmp_path):
    base = tmp_path / "cache"
    summary = fetched(base)
    summary["sources"][0]["warnings"] = ["Content-MD5 x does not match the bytes"]
    write_version(recipe=RECIPE, record=record(), fetch_summary=summary, cache_base=base, product=Product(kind="graph", graph=graph(), weight="trips"), out_dir=tmp_path / "data", catalog_dir=tmp_path / "catalog", released="2026-11-04", pipeline=PIPELINE)
    prov = json.loads((tmp_path / "data" / "test-graph" / "1.0.0" / "provenance.json").read_text(encoding="utf-8"))
    assert prov["sources"][0]["warnings"] == ["Content-MD5 x does not match the bytes"]


def test_a_snapshot_series_explains_repeated_pairs_as_one_link_per_snapshot(tmp_path):
    g = Graph(directed=True, node_attrs=["name"], edge_attrs=["month", "trips"])
    g.add_node("s1", name="甲站")
    g.add_node("s2", name="乙站")
    g.add_edge("s1", "s2", month="2026-08", trips=3)
    g.add_edge("s1", "s2", month="2026-09", trips=4)
    m = build(tmp_path, "a", product=Product(kind="graph", graph=g, weight="trips", snapshot="month"))
    assert m["statistics"]["graph"]["repeated_pairs"] == 1
    zh, en = m["changelog"]["zh-Hant"], m["changelog"]["en"]
    assert "重複出現" not in zh
    assert "2 個月份快照" in zh and "同一快照內沒有重複的配對" in zh
    assert "2 monthly snapshots" in en


def test_final_review_d4_a_transformation_without_english_is_refused(tmp_path):
    recipe = {**RECIPE, "transformations": [{"zh-Hant": "依起訖加總。"}]}
    with pytest.raises(VersionError, match="en"):
        build(tmp_path, "a", recipe=recipe)


def test_final_review_d4_a_license_without_a_url_is_refused(tmp_path):
    rec = record(license={"id": "CC-BY-4.0", "attribution": "x"}, redistribution={"basis": "own-work"})
    recipe = {**RECIPE, "sources": [{k: v for k, v in RECIPE["sources"][0].items() if k != "license"}]}
    with pytest.raises(VersionError, match="url"):
        build(tmp_path, "a", rec=rec, recipe=recipe)


def test_final_review_d3_the_version_states_its_coverage_from_the_recipe(tmp_path):
    m = build(tmp_path, "a")
    assert m["coverage"] == {"temporal": {"start": "2026-09", "end": "2026-09"}}
    assert schema_errors("version", m) == []
    with pytest.raises(VersionError, match="coverage"):
        build(tmp_path, "b", recipe={k: v for k, v in RECIPE.items() if k != "coverage"})
