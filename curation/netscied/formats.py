"""Canonical formats (data-curation spec, "Canonical formats per structure kind").

- Graphs (bipartite, multigraph, temporal, multilayer): a CSV bundle of
  nodes.csv and edges.csv described by a Frictionless datapackage.json, and a
  GraphML file. nodes.csv keeps a 0..N-1 index and the upstream id, so the
  conversion is lossless; parallel edges are never merged.
- Hypergraphs: HIF JSON (https://github.com/HIF-org/HIF-standard), validated
  against the official schema (a pinned copy in netscied/schemas/).

Every writer is deterministic: same input, same bytes (UTF-8 without BOM,
LF line endings, insertion order kept).
"""

from __future__ import annotations

import csv
import io
import json
from pathlib import Path
from xml.sax.saxutils import escape, quoteattr

import jsonschema
import networkx as nx

HIF_SCHEMA = Path(__file__).parent / "schemas" / "hif_schema.json"
GRAPHML_NS = "http://graphml.graphdrawing.org/xmlns"


def _infer_type(values) -> str:
    seen = [v for v in values if v is not None and v != ""]
    if not seen:
        return "string"
    if all(isinstance(v, bool) for v in seen):
        return "boolean"
    if all(isinstance(v, int) and not isinstance(v, bool) for v in seen):
        return "integer"
    if all(isinstance(v, (int, float)) and not isinstance(v, bool) for v in seen):
        return "number"
    return "string"


def _cell(v) -> str:
    if v is None:
        return ""
    if isinstance(v, bool):
        return "true" if v else "false"
    return str(v)


class Graph:
    """A graph in insertion order, with typed node and edge attributes."""

    def __init__(self, directed: bool, node_attrs=(), edge_attrs=(), multi: bool = True):
        self.directed = directed
        self.multi = multi
        self.node_attrs = list(node_attrs)
        self.edge_attrs = list(edge_attrs)
        self.nodes: dict[str, dict] = {}
        self.edges: list[tuple[str, str, dict]] = []

    def add_node(self, node_id: str, **attrs):
        if node_id in self.nodes:
            raise ValueError(f"duplicate node id {node_id!r}")
        self.nodes[str(node_id)] = attrs

    def add_edge(self, source: str, target: str, **attrs):
        for end in (source, target):
            if end not in self.nodes:
                raise ValueError(f"edge refers to unknown node {end!r}")
        self.edges.append((source, target, attrs))

    def types(self):
        node_types = {a: _infer_type(n.get(a) for n in self.nodes.values()) for a in self.node_attrs}
        edge_types = {a: _infer_type(e[2].get(a) for e in self.edges) for a in self.edge_attrs}
        return node_types, edge_types


def _csv_text(header, rows) -> str:
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\n")
    w.writerow(header)
    for r in rows:
        w.writerow([_cell(v) for v in r])
    return buf.getvalue()


def write_csv_bundle(graph: Graph, out_dir, *, name: str, version: str, title: str, license_id: str, license_url: str | None = None, description: str | None = None):
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    node_types, edge_types = graph.types()
    nodes_csv = out / "nodes.csv"
    edges_csv = out / "edges.csv"
    nodes_csv.write_text(
        _csv_text(["index", "id", *graph.node_attrs], ([i, nid, *(a.get(k) for k in graph.node_attrs)] for i, (nid, a) in enumerate(graph.nodes.items()))),
        encoding="utf-8",
    )
    edges_csv.write_text(
        _csv_text(["id", "source", "target", *graph.edge_attrs], ([f"e{i}", s, t, *(a.get(k) for k in graph.edge_attrs)] for i, (s, t, a) in enumerate(graph.edges))),
        encoding="utf-8",
    )
    field = lambda n, t: {"name": n, "type": t}  # noqa: E731
    package = {
        "$schema": "https://datapackage.org/profiles/2.0/datapackage.json",
        "name": name,
        "title": title,
        "version": version,
        **({"description": description} if description else {}),
        "licenses": [{"name": license_id, **({"path": license_url} if license_url else {})}],
        # How to read edges.csv back into a graph (a Data Package allows extra properties).
        "x-netscied": {"kind": "graph", "directed": graph.directed, "multi_edges": graph.multi},
        "resources": [
            {
                "name": "nodes",
                "path": "nodes.csv",
                "type": "table",
                "format": "csv",
                "mediatype": "text/csv",
                "encoding": "utf-8",
                "schema": {
                    "fields": [field("index", "integer"), field("id", "string"), *(field(a, node_types[a]) for a in graph.node_attrs)],
                    "primaryKey": ["id"],
                },
            },
            {
                "name": "edges",
                "path": "edges.csv",
                "type": "table",
                "format": "csv",
                "mediatype": "text/csv",
                "encoding": "utf-8",
                "schema": {
                    "fields": [field("id", "string"), field("source", "string"), field("target", "string"), *(field(a, edge_types[a]) for a in graph.edge_attrs)],
                    "primaryKey": ["id"],
                    "foreignKeys": [
                        {"fields": ["source"], "reference": {"resource": "nodes", "fields": ["id"]}},
                        {"fields": ["target"], "reference": {"resource": "nodes", "fields": ["id"]}},
                    ],
                },
            },
        ],
    }
    dp = out / "datapackage.json"
    dp.write_text(json.dumps(package, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return [nodes_csv, edges_csv, dp]


def _parse(value: str, typ: str):
    if value == "":
        return None
    if typ == "boolean":
        return value == "true"
    if typ == "integer":
        return int(value)
    if typ == "number":
        return float(value)
    return value


def read_csv_bundle(bundle_dir) -> nx.MultiGraph | nx.MultiDiGraph:
    """Reads a CSV bundle back into networkx, with the types its datapackage declares."""
    d = Path(bundle_dir)
    package = json.loads((d / "datapackage.json").read_text(encoding="utf-8"))
    types = {r["name"]: {f["name"]: f["type"] for f in r["schema"]["fields"]} for r in package["resources"]}
    with (d / "edges.csv").open(encoding="utf-8", newline="") as f:
        edges = list(csv.DictReader(f))
    directed = bool(package.get("x-netscied", {}).get("directed"))
    g = nx.MultiDiGraph() if directed else nx.MultiGraph()
    with (d / "nodes.csv").open(encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            g.add_node(row["id"], **{k: _parse(v, types["nodes"][k]) for k, v in row.items() if k not in ("id",)})
    for row in edges:
        g.add_edge(row["source"], row["target"], key=row["id"], **{k: _parse(v, types["edges"][k]) for k, v in row.items() if k not in ("id", "source", "target")})
    return g


_GRAPHML_TYPES = {"boolean": "boolean", "integer": "long", "number": "double", "string": "string"}


def write_graphml(graph: Graph, path) -> Path:
    path = Path(path)
    node_types, edge_types = graph.types()
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        f'<graphml xmlns="{GRAPHML_NS}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"'
        f' xsi:schemaLocation="{GRAPHML_NS} {GRAPHML_NS}/1.0/graphml.xsd">',
    ]
    for a in graph.node_attrs:
        lines.append(f'  <key id={quoteattr("n_" + a)} for="node" attr.name={quoteattr(a)} attr.type="{_GRAPHML_TYPES[node_types[a]]}"/>')
    for a in graph.edge_attrs:
        lines.append(f'  <key id={quoteattr("e_" + a)} for="edge" attr.name={quoteattr(a)} attr.type="{_GRAPHML_TYPES[edge_types[a]]}"/>')
    lines.append(f'  <graph id="G" edgedefault="{"directed" if graph.directed else "undirected"}">')
    for nid, attrs in graph.nodes.items():
        data = "".join(f'<data key={quoteattr("n_" + a)}>{escape(_cell(attrs[a]))}</data>' for a in graph.node_attrs if attrs.get(a) is not None)
        lines.append(f"    <node id={quoteattr(nid)}>{data}</node>")
    for i, (s, t, attrs) in enumerate(graph.edges):
        data = "".join(f'<data key={quoteattr("e_" + a)}>{escape(_cell(attrs[a]))}</data>' for a in graph.edge_attrs if attrs.get(a) is not None)
        lines.append(f'    <edge id="e{i}" source={quoteattr(s)} target={quoteattr(t)}>{data}</edge>')
    lines += ["  </graph>", "</graphml>", ""]
    path.write_text("\n".join(lines), encoding="utf-8")
    return path


class Hypergraph:
    """A hypergraph as nodes, hyperedges and incidences, in insertion order."""

    def __init__(self, node_attrs=(), edge_attrs=(), incidence_attrs=()):
        self.node_attrs = list(node_attrs)
        self.edge_attrs = list(edge_attrs)
        self.incidence_attrs = list(incidence_attrs)
        self.nodes: dict[str, dict] = {}
        self.edges: dict[str, dict] = {}
        self.incidences: list[tuple[str, str, dict]] = []

    def add_node(self, node_id: str, **attrs):
        if node_id in self.nodes:
            raise ValueError(f"duplicate node id {node_id!r}")
        self.nodes[str(node_id)] = attrs

    def add_edge(self, edge_id: str, **attrs):
        if edge_id in self.edges:
            raise ValueError(f"duplicate hyperedge id {edge_id!r}")
        self.edges[str(edge_id)] = attrs

    def add_incidence(self, edge_id: str, node_id: str, **attrs):
        if edge_id not in self.edges or node_id not in self.nodes:
            raise ValueError(f"incidence ({edge_id!r}, {node_id!r}) refers to an unknown hyperedge or node")
        self.incidences.append((edge_id, node_id, attrs))


def _attrs(d: dict, names) -> dict:
    return {k: d[k] for k in names if d.get(k) is not None}


def write_hif(h: Hypergraph, path, *, metadata: dict | None = None, network_type: str = "undirected") -> Path:
    path = Path(path)
    doc = {
        "network-type": network_type,
        "metadata": metadata or {},
        "nodes": [{"node": nid, "attrs": _attrs(a, h.node_attrs)} for nid, a in h.nodes.items()],
        "edges": [{"edge": eid, "attrs": _attrs(a, h.edge_attrs)} for eid, a in h.edges.items()],
        "incidences": [{"edge": e, "node": n, "attrs": _attrs(a, h.incidence_attrs)} for e, n, a in h.incidences],
    }
    validate_hif(doc)
    path.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return path


def validate_hif(doc: dict) -> None:
    schema = json.loads(HIF_SCHEMA.read_text(encoding="utf-8"))
    jsonschema.validate(doc, schema)
