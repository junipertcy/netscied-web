"""第55屆金馬獎 (2018) nominee–film network from the maintainer's transcription
of the official list (curation/inputs/golden-horse-2018-nominations/nominations.csv).

Each row naming a person is one person–film edge with its category and winner
mark; a person nominated twice for the same film keeps two edges. Owner decision
2026-11-04: Best Feature Film (最佳劇情長片) honours the film, so its rows give no
edges, and companies are never nodes (they are not in the CSV).
"""

from __future__ import annotations

import csv

from ..formats import Graph
from ..version import Product

FILM_ONLY = {"最佳劇情長片"}


def convert(recipe: dict, files: dict, options: dict) -> Product:
    (path,) = files["official-nominee-list"]
    with open(path, encoding="utf-8", newline="") as f:
        rows = list(csv.DictReader(f))
    g = Graph(directed=False, node_attrs=["kind", "label", "label_en"], edge_attrs=["category", "category_en", "winner"], multi=True)
    for r in rows:
        fid = f"film:{r['film_zh']}"
        if fid not in g.nodes:
            g.add_node(fid, kind="film", label=r["film_zh"], label_en=r["film_en"] or None)
    for r in rows:
        if r["category_zh"] in FILM_ONLY or not r["nominee_zh"]:
            continue
        pid = f"person:{r['nominee_zh']}"
        if pid not in g.nodes:
            g.add_node(pid, kind="person", label=r["nominee_zh"], label_en=r["nominee_original"] or None)
        if r["is_winner"] not in ("true", "false"):
            raise ValueError(f"is_winner must be true or false, not {r['is_winner']!r}")
        g.add_edge(pid, f"film:{r['film_zh']}", category=r["category_zh"], category_en=r["category_en"], winner=r["is_winner"] == "true")
    return Product(kind="graph", graph=g, partition="kind")
