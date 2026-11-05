"""Task 8.2: recipes load as YAML 1.2 and validate against the published recipe schema
(data-curation spec, "Reproducible fetch recipes")."""

import pytest

from netscied.recipes import RecipeError, load_recipe, load_yaml, recipe_path

GOLDEN = recipe_path("golden-horse-2018-nominations")


def test_the_committed_recipe_validates():
    r = load_recipe(GOLDEN)
    assert r["dataset"] == "golden-horse-2018-nominations"
    assert r["sources"][0]["method"] == "manual"


def test_dates_and_yes_no_stay_strings_as_in_yaml_1_2(tmp_path):
    f = tmp_path / "x.yaml"
    f.write_text("a: 2026-11-04\nb: yes\nc: true\nd: 1.0.0\ne: 12\n", encoding="utf-8")
    assert load_yaml(f) == {"a": "2026-11-04", "b": "yes", "c": True, "d": "1.0.0", "e": 12}


def _write(tmp_path, text):
    f = tmp_path / "r.yaml"
    f.write_text(text, encoding="utf-8")
    return f


BASE = """dataset: some-data
version: "1.0.0"
convert: {converter: golden_horse, kind: graph}
sources:
  - id: s1
    landing_page: https://example.org/
    license_evidence: {url: https://example.org/license, checked_on: 2026-11-04}
"""


def test_an_unknown_method_is_rejected(tmp_path):
    with pytest.raises(RecipeError, match="method"):
        load_recipe(_write(tmp_path, BASE + "    method: scrape\n    url: https://example.org/a\n"))


def test_a_manual_source_needs_steps_and_a_file(tmp_path):
    with pytest.raises(RecipeError, match="steps|file"):
        load_recipe(_write(tmp_path, BASE + "    method: manual\n"))


def test_a_get_source_needs_a_url(tmp_path):
    with pytest.raises(RecipeError, match="url"):
        load_recipe(_write(tmp_path, BASE + "    method: get\n"))


def test_the_file_name_must_match_the_dataset(tmp_path):
    f = tmp_path / "other-name.yaml"
    f.write_text(BASE + "    method: get\n    url: https://example.org/a\n", encoding="utf-8")
    with pytest.raises(RecipeError, match="file name"):
        load_recipe(f)
