"""Statistics per structure kind (data-curation spec, "Computed statistics"):
graphs — nodes, edges, per-partition counts, unique and repeated pairs, self-loops,
isolated nodes, (weakly) connected components; hypergraphs — nodes, hyperedges,
incidences, edge-size range, empty hyperedges, isolated nodes."""

from __future__ import annotations

from collections import Counter

import networkx as nx

from .formats import Graph, Hypergraph


def graph_stats(g: Graph, *, partition: str | None = None, weight: str | None = None) -> dict:
    pairs = Counter((s, t) if g.directed else tuple(sorted((s, t))) for s, t, _ in g.edges)
    touched = {n for s, t, _ in g.edges for n in (s, t)}
    simple = nx.Graph()
    simple.add_nodes_from(g.nodes)
    simple.add_edges_from((s, t) for s, t, _ in g.edges)
    components = [len(c) for c in nx.connected_components(simple)]
    out = {"nodes": len(g.nodes), "edges": len(g.edges)}
    if partition:
        out["partitions"] = dict(sorted(Counter(str(a.get(partition)) for a in g.nodes.values()).items()))
    out |= {
        "unique_pairs": len(pairs),
        "repeated_pairs": len(g.edges) - len(pairs),
        "self_loops": sum(1 for s, t, _ in g.edges if s == t),
        "isolated_nodes": sum(1 for n in g.nodes if n not in touched),
        "components": len(components),
        "largest_component_nodes": max(components, default=0),
    }
    if weight:
        total = sum(a.get(weight) or 0 for _, _, a in g.edges)
        out["total_weight"] = int(total) if float(total).is_integer() else total
    return out


def hypergraph_stats(h: Hypergraph) -> dict:
    sizes = Counter({e: 0 for e in h.edges})
    sizes.update(e for e, _, _ in h.incidences)
    touched = {n for _, n, _ in h.incidences}
    values = list(sizes.values())
    return {
        "nodes": len(h.nodes),
        "hyperedges": len(h.edges),
        "incidences": len(h.incidences),
        "edge_size": {"min": min(values, default=0), "max": max(values, default=0), "mean": round(sum(values) / len(values), 4) if values else 0},
        "empty_hyperedges": sum(1 for v in values if v == 0),
        "isolated_nodes": sum(1 for n in h.nodes if n not in touched),
    }
