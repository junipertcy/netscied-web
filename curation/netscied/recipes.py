"""Recipes (curation/recipes/<id>.yaml) and the repository layout.

YAML is read as YAML 1.2 core, like the site build (scripts/catalog/lib/yaml.mjs):
dates stay strings, and only true/false are booleans. Recipes validate against
the published source-record schema schemas/v1/recipe.schema.json.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import jsonschema
import yaml
from referencing import Registry, Resource

REPO = Path(__file__).resolve().parents[2]
SCHEMAS = REPO / "schemas" / "v1"


class RecipeError(ValueError):
    pass


class _Yaml12Loader(yaml.SafeLoader):
    """SafeLoader with YAML 1.2 core scalars: no timestamps, no yes/no/on/off booleans."""


_Yaml12Loader.yaml_implicit_resolvers = {
    k: [(tag, rx) for tag, rx in v if tag not in ("tag:yaml.org,2002:timestamp", "tag:yaml.org,2002:bool")]
    for k, v in yaml.SafeLoader.yaml_implicit_resolvers.items()
}
_Yaml12Loader.add_implicit_resolver("tag:yaml.org,2002:bool", re.compile(r"^(?:true|True|TRUE|false|False|FALSE)$"), list("tTfF"))


def load_yaml(path):
    with open(path, encoding="utf-8") as f:
        return yaml.load(f, Loader=_Yaml12Loader)  # noqa: S506 (a SafeLoader subclass)


def _registry(root: Path = SCHEMAS) -> Registry:
    resources = []
    for p in sorted(root.glob("*.schema.json")) + sorted((root / "api").glob("*.schema.json")):
        doc = json.loads(p.read_text(encoding="utf-8"))
        resources.append((doc["$id"], Resource.from_contents(doc)))
    return Registry().with_resources(resources)


def schema_validator(name: str, root: Path = SCHEMAS):
    schema = json.loads((root / f"{name}.schema.json").read_text(encoding="utf-8"))
    return jsonschema.Draft202012Validator(schema, registry=_registry(root), format_checker=jsonschema.FormatChecker())


def schema_errors(name: str, doc) -> list[str]:
    errors = sorted(schema_validator(name).iter_errors(doc), key=lambda e: list(e.absolute_path))
    return [f"{'.'.join(str(p) for p in e.absolute_path) or '(root)'}: {e.message}" for e in errors]


def recipe_path(dataset_id: str) -> Path:
    return REPO / "curation" / "recipes" / f"{dataset_id}.yaml"


def load_recipe(path) -> dict:
    path = Path(path)
    doc = load_yaml(path)
    errors = schema_errors("recipe", doc)
    if errors:
        raise RecipeError(f"{path}: " + "; ".join(errors))
    if path.stem != doc["dataset"]:
        raise RecipeError(f"{path}: the file name must equal the dataset id {doc['dataset']!r}")
    return doc


def dataset_record(dataset_id: str) -> dict:
    return load_yaml(REPO / "catalog" / "datasets" / f"{dataset_id}.yaml")
