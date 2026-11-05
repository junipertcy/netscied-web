"""Converters from fetched upstream files to a Product (graph or hypergraph).

Each converter takes the recipe and {source id: [fetched files]} and returns a
Product. Converters are deterministic and never touch the network.
"""

from __future__ import annotations

from ..version import Product
from . import golden_horse, ly_cosponsorship

CONVERTERS = {
    "golden_horse": golden_horse.convert,
    "ly_cosponsorship": ly_cosponsorship.convert,
}


def convert(recipe: dict, files: dict) -> Product:
    name = recipe["convert"]["converter"]
    if name not in CONVERTERS:
        raise KeyError(f"no converter named {name!r}; known: {sorted(CONVERTERS)}")
    product = CONVERTERS[name](recipe, files, recipe["convert"].get("options") or {})
    if product.kind != recipe["convert"]["kind"]:
        raise ValueError(f"converter {name} returned a {product.kind}, the recipe expects a {recipe['convert']['kind']}")
    return product
