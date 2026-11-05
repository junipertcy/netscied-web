"""Task 8.3: canonical formats round-trip, validate against their schemas, and are
byte-identical when rebuilt from the same input (data-curation spec)."""

import json

import networkx as nx
import pytest
import xgi
from frictionless import validate

from netscied.formats import Graph, Hypergraph, read_csv_bundle, write_csv_bundle, write_graphml, write_hif, validate_hif


@pytest.fixture
def graph():
    g = Graph(directed=False, node_attrs=["kind", "label"], edge_attrs=["category", "winner"], multi=True)
    g.add_node("f1", kind="film", label="影")
    g.add_node("p1", kind="person", label="張藝謀")
    g.add_node("p2", kind="person", label="UMA WANG")
    g.add_node("f2", kind="film", label="當　一個人")
    g.add_edge("p1", "f1", category="最佳導演", winner=True)
    g.add_edge("p1", "f1", category="最佳改編劇本", winner=False)
    g.add_edge("p2", "f1", category="最佳造型設計", winner=False)
    return g


def test_csv_bundle_round_trip_keeps_counts_attributes_and_multi_edges(graph, tmp_path):
    files = write_csv_bundle(graph, tmp_path, name="test-graph", version="1.0.0", title="測試", license_id="CC-BY-4.0")
    assert sorted(p.name for p in files) == ["datapackage.json", "edges.csv", "nodes.csv"]
    back = read_csv_bundle(tmp_path)
    assert back.number_of_nodes() == 4
    assert back.number_of_edges() == 3
    assert back.nodes["f2"]["label"] == "當　一個人"
    assert sorted(d["category"] for _, _, d in back.edges(data=True)) == ["最佳導演", "最佳改編劇本", "最佳造型設計"]
    text = (tmp_path / "nodes.csv").read_bytes()
    assert not text.startswith(b"\xef\xbb\xbf")
    assert b"\r\n" not in text


def test_nodes_csv_keeps_index_and_upstream_id(graph, tmp_path):
    write_csv_bundle(graph, tmp_path, name="test-graph", version="1.0.0", title="測試", license_id="CC-BY-4.0")
    header, first = (tmp_path / "nodes.csv").read_text(encoding="utf-8").splitlines()[:2]
    assert header.split(",")[:2] == ["index", "id"]
    assert first.startswith("0,")


def test_datapackage_validates_with_frictionless(graph, tmp_path):
    write_csv_bundle(graph, tmp_path, name="test-graph", version="1.0.0", title="測試", license_id="CC-BY-4.0")
    report = validate(str(tmp_path / "datapackage.json"))
    assert report.valid, report.flatten(["rowNumber", "fieldName", "type", "note"])


def test_graphml_round_trip_matches_the_csv_bundle(graph, tmp_path):
    path = write_graphml(graph, tmp_path / "g.graphml")
    g = nx.read_graphml(path, force_multigraph=True)
    assert g.number_of_nodes() == 4
    assert g.number_of_edges() == 3
    assert g.nodes["p2"]["label"] == "UMA WANG"
    winners = [d["winner"] for _, _, d in g.edges(data=True)]
    assert sorted(winners) == [False, False, True]
    # Task 12.13: every attribute of every node and edge agrees with the CSV bundle.
    write_csv_bundle(graph, tmp_path / "csv", name="test-graph", version="1.0.0", title="測試", license_id="CC-BY-4.0")
    c = read_csv_bundle(tmp_path / "csv")
    for n, a in c.nodes(data=True):
        assert dict(g.nodes[n]) == {k: v for k, v in a.items() if k != "index" and v is not None}, n
    edges = lambda h: sorted((u, v, tuple(sorted((k, x) for k, x in d.items() if k != "id"))) for u, v, d in h.edges(data=True))  # noqa: E731
    assert edges(g) == edges(c)


def test_rebuilding_gives_byte_identical_files(graph, tmp_path):
    a, b = tmp_path / "a", tmp_path / "b"
    for d in (a, b):
        write_csv_bundle(graph, d, name="test-graph", version="1.0.0", title="測試", license_id="CC-BY-4.0")
        write_graphml(graph, d / "g.graphml")
    for name in ["nodes.csv", "edges.csv", "datapackage.json", "g.graphml"]:
        assert (a / name).read_bytes() == (b / name).read_bytes(), name


@pytest.fixture
def hyper():
    h = Hypergraph(node_attrs=["name", "party"], edge_attrs=["title", "date"], incidence_attrs=["role"])
    h.add_node("m1", name="委員甲", party="甲黨")
    h.add_node("m2", name="委員乙", party="乙黨")
    h.add_node("m3", name="委員丙", party="甲黨")
    h.add_edge("b1", title="某某法修正草案", date="2021-03-23")
    h.add_edge("b2", title="另一法案", date="2021-04-01")
    h.add_incidence("b1", "m1", role="proposer")
    h.add_incidence("b1", "m2", role="cosigner")
    h.add_incidence("b2", "m2", role="proposer")
    h.add_incidence("b2", "m3", role="cosigner")
    return h


def test_hif_validates_against_the_official_schema_and_round_trips_through_xgi(hyper, tmp_path):
    path = write_hif(hyper, tmp_path / "h.hif.json", metadata={"title": "測試"})
    data = json.loads(path.read_text(encoding="utf-8"))
    validate_hif(data)
    assert data["network-type"] == "undirected"
    H = xgi.read_hif(str(path))
    assert H.num_nodes == 3
    assert H.num_edges == 2
    assert sorted(len(e) for e in H.edges.members()) == [2, 2]


def test_hif_schema_rejects_a_bad_document():
    with pytest.raises(Exception):
        validate_hif({"incidences": [{"edge": "b1"}]})


def test_hif_is_byte_identical_when_rebuilt(hyper, tmp_path):
    a = write_hif(hyper, tmp_path / "a.json", metadata={"title": "測試"})
    b = write_hif(hyper, tmp_path / "b.json", metadata={"title": "測試"})
    assert a.read_bytes() == b.read_bytes()


def test_the_pinned_hif_schema_names_its_source_commit_and_matches_it():
    """Task 12.12: the copy's provenance sits next to it, and the git blob id it records is the copy's."""
    import hashlib
    import re

    from netscied.formats import HIF_SCHEMA

    note = HIF_SCHEMA.with_name("hif_schema.SOURCE.txt").read_text(encoding="utf-8")
    assert re.search(r"https://github\.com/HIF-org/HIF-standard/blob/[0-9a-f]{40}/schemas/hif_schema\.json", note)
    blob = re.search(r"git blob: ([0-9a-f]{40})", note).group(1)
    data = HIF_SCHEMA.read_bytes()
    assert hashlib.sha1(b"blob %d\0" % len(data) + data).hexdigest() == blob  # noqa: S324 (git's object id)
