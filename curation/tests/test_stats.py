"""Task 8.4: statistics per structure kind (data-curation spec, "Computed statistics")."""

from netscied.formats import Graph, Hypergraph
from netscied.stats import graph_stats, hypergraph_stats


def test_graph_stats_count_partitions_repeated_pairs_self_loops_isolates_and_components():
    g = Graph(directed=False, node_attrs=["kind"], edge_attrs=["category"])
    for nid, kind in [("f1", "film"), ("f2", "film"), ("p1", "person"), ("p2", "person"), ("p3", "person"), ("lonely", "person")]:
        g.add_node(nid, kind=kind)
    g.add_edge("p1", "f1", category="a")
    g.add_edge("f1", "p1", category="b")  # the same pair, undirected
    g.add_edge("p2", "f1", category="a")
    g.add_edge("p3", "f2", category="a")
    g.add_edge("p3", "p3", category="loop")
    s = graph_stats(g, partition="kind")
    assert s == {
        "nodes": 6,
        "edges": 5,
        "partitions": {"film": 2, "person": 4},
        "unique_pairs": 4,
        "repeated_pairs": 1,
        "self_loops": 1,
        "isolated_nodes": 1,
        "components": 3,
        "largest_component_nodes": 3,
    }


def test_directed_pairs_keep_their_direction_and_weights_are_summed():
    g = Graph(directed=True, node_attrs=[], edge_attrs=["trips"])
    for nid in "abc":
        g.add_node(nid)
    g.add_edge("a", "b", trips=5)
    g.add_edge("b", "a", trips=2)
    g.add_edge("a", "b", trips=1)
    s = graph_stats(g, weight="trips")
    assert s["unique_pairs"] == 2
    assert s["repeated_pairs"] == 1
    assert s["total_weight"] == 8
    assert s["components"] == 2  # weakly connected: {a, b} and {c}


def test_hypergraph_stats_report_sizes_empty_edges_and_isolates():
    h = Hypergraph()
    for n in ["m1", "m2", "m3", "m4"]:
        h.add_node(n)
    for e in ["b1", "b2", "b3"]:
        h.add_edge(e)
    h.add_incidence("b1", "m1")
    h.add_incidence("b1", "m2")
    h.add_incidence("b1", "m3")
    h.add_incidence("b2", "m2")
    s = hypergraph_stats(h)
    assert s == {
        "nodes": 4,
        "hyperedges": 3,
        "incidences": 4,
        "edge_size": {"min": 0, "max": 3, "mean": 1.3333},
        "empty_hyperedges": 1,
        "isolated_nodes": 1,
    }
