"""Task 8.3 / 4.1: the 第55屆金馬獎 nominee–film network from the committed
transcription (owner decision 2026-11-04: Best Feature Film is film-only, and
companies are not nodes)."""

import csv
from pathlib import Path

import pytest

from netscied.converters import convert
from netscied.recipes import REPO, load_recipe, recipe_path
from netscied.stats import graph_stats

CSV = REPO / "curation" / "inputs" / "golden-horse-2018-nominations" / "nominations.csv"


@pytest.fixture(scope="module")
def product():
    recipe = load_recipe(recipe_path("golden-horse-2018-nominations"))
    return convert(recipe, {"official-nominee-list": [CSV]})


def rows():
    with CSV.open(encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def test_every_named_nominee_outside_best_feature_film_is_one_edge(product):
    g = product.graph
    expected = [r for r in rows() if r["nominee_zh"] and r["category_zh"] != "最佳劇情長片"]
    assert len(g.edges) == len(expected) == 146
    assert not any(a["category"] == "最佳劇情長片" for _, _, a in g.edges)


def test_the_counts_match_the_spec_scenario_13_repeated_pairs(product):
    s = graph_stats(product.graph, partition=product.partition)
    assert (s["edges"], s["unique_pairs"], s["repeated_pairs"]) == (146, 133, 13)
    assert s["partitions"] == {"film": 42, "person": 132}
    assert s["self_loops"] == 0


def test_the_five_best_feature_film_nominees_are_film_nodes_and_no_company_is_a_node(product):
    g = product.graph
    films = {r["film_zh"] for r in rows() if r["category_zh"] == "最佳劇情長片"}
    assert len(films) == 5
    for f in films:
        assert g.nodes[f"film:{f}"]["kind"] == "film"
    assert "person:楚延華" not in g.nodes and "person:胡永振" not in g.nodes
    assert {a["kind"] for a in g.nodes.values()} == {"film", "person"}


def test_names_and_titles_are_kept_as_printed_with_the_record_attribute_names(product):
    g = product.graph
    assert g.node_attrs == ["kind", "label", "label_en"]
    assert g.edge_attrs == ["category", "category_en", "winner"]
    assert g.nodes["film:當　一個人"]["label"] == "當　一個人"
    assert g.nodes["person:包軒鳴"]["label_en"] == "Jake POLLOCK"
    assert g.nodes["film:影"]["label_en"] == "Shadow"
    winners = [a for _, _, a in g.edges if a["winner"]]
    assert all(isinstance(a["winner"], bool) for _, _, a in g.edges)
    assert len(winners) == sum(1 for r in rows() if r["is_winner"] == "true" and r["category_zh"] != "最佳劇情長片")


def test_the_graph_is_undirected_and_film_person(product):
    g = product.graph
    assert not g.directed
    for s, t, _ in g.edges:
        assert g.nodes[s]["kind"] == "person" and g.nodes[t]["kind"] == "film"


def test_the_graphml_file_and_the_csv_bundle_agree(product, tmp_path):
    import networkx as nx

    from netscied.formats import read_csv_bundle, write_csv_bundle, write_graphml

    write_csv_bundle(product.graph, tmp_path, name="gh", version="1.0.0", title="金馬", license_id="CC-BY-4.0")
    gml = nx.read_graphml(write_graphml(product.graph, tmp_path / "gh.graphml"), force_multigraph=True)
    csvg = read_csv_bundle(tmp_path)
    assert (gml.number_of_nodes(), gml.number_of_edges()) == (csvg.number_of_nodes(), csvg.number_of_edges()) == (174, 146)
    for n, a in csvg.nodes(data=True):
        assert {k: v for k, v in gml.nodes[n].items()} == {k: v for k, v in a.items() if k != "index" and v is not None}, n
    key = lambda d: (d["category"], d["winner"])  # noqa: E731
    for u, v in csvg.edges():
        assert sorted(map(key, gml.get_edge_data(u, v).values())) == sorted(map(key, csvg.get_edge_data(u, v).values()))
