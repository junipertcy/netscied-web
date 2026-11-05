"""Task 8.3: the Taipei Metro monthly OD aggregate from the hourly upstream files
(UTF-8 with BOM, CRLF line ends, header 日期,時段,進站,出站,人次)."""

import pytest

from netscied.converters import convert
from netscied.stats import graph_stats

RECIPE = {"dataset": "taipei-metro-od-monthly", "convert": {"converter": "metro_od", "kind": "graph"}}


def write(path, rows):
    text = "日期,時段,進站,出站,人次\r\n" + "".join(",".join(map(str, r)) + "\r\n" for r in rows)
    path.write_bytes("﻿".encode("utf-8") + text.encode("utf-8"))
    return path


@pytest.fixture
def files(tmp_path):
    sep = write(
        tmp_path / "od_202609.csv",
        [
            ("2026-09-01", "00", "松山機場", "台北車站", 3),
            ("2026-09-01", "01", "松山機場", "台北車站", 4),
            ("2026-09-02", "08", "松山機場", "台北車站", 5),
            ("2026-09-01", "08", "台北車站", "松山機場", 0),
            ("2026-09-01", "08", "台北車站", "台北車站", 2),
            ("2026-09-01", "08", "十四張", "G大坪林", 1),
        ],
    )
    aug = write(tmp_path / "od_202608.csv", [("2026-08-31", "23", "松山機場", "台北車站", 7), ("2026-08-31", "23", "台北車站", "松山機場", 0)])
    return {"od-2026-09": [sep], "od-2026-08": [aug], "monthly-index": [tmp_path / "index.csv"]}


def test_hourly_counts_are_summed_per_month_and_pair(files):
    g = convert(RECIPE, files).graph
    edges = [(a["month"], s, t, a["trips"]) for s, t, a in g.edges]
    assert edges == [
        ("2026-08", "松山機場", "台北車站", 7),
        ("2026-09", "十四張", "G大坪林", 1),
        ("2026-09", "台北車站", "台北車站", 2),
        ("2026-09", "松山機場", "台北車站", 12),
    ]
    assert g.directed
    assert g.edge_attrs == ["month", "trips"]


def test_pairs_with_a_zero_monthly_sum_are_not_listed_and_self_loops_are_kept(files):
    p = convert(RECIPE, files)
    s = graph_stats(p.graph, weight=p.weight)
    assert s["self_loops"] == 1
    assert s["total_weight"] == 22
    assert not any(s_ == "台北車站" and t == "松山機場" for s_, t, _ in p.graph.edges)


def test_station_names_are_kept_as_given_and_marked_by_the_side_they_appear_on(files):
    g = convert(RECIPE, files).graph
    assert g.nodes["十四張"]["appears_as"] == "entry"
    assert g.nodes["G大坪林"]["appears_as"] == "exit"
    assert g.nodes["台北車站"]["appears_as"] == "both"
    # A station that only appears in zero-sum rows is still a station of the file.
    assert set(g.nodes) == {"松山機場", "台北車站", "十四張", "G大坪林"}


def test_station_aliases_from_the_recipe_merge_names(files):
    write(files["od-2026-08"][0], [("2026-08-31", "23", "大坪林", "台北車站", 7)])
    recipe = {**RECIPE, "convert": {**RECIPE["convert"], "options": {"station_aliases": {"G大坪林": "大坪林"}}}}
    g = convert(recipe, files).graph
    assert "G大坪林" not in g.nodes
    assert g.nodes["大坪林"]["appears_as"] == "both"
    assert any(t == "大坪林" for _, t, _ in g.edges)


def test_a_row_from_another_month_fails(files, tmp_path):
    write(files["od-2026-08"][0], [("2026-09-01", "00", "松山機場", "台北車站", 1)])
    with pytest.raises(ValueError, match="2026-08"):
        convert(RECIPE, files)


def test_a_wrong_header_fails(files):
    files["od-2026-08"][0].write_text("date,hour,from,to,n\n", encoding="utf-8")
    with pytest.raises(ValueError, match="header"):
        convert(RECIPE, files)


def test_an_alias_to_an_unknown_station_fails(files):
    recipe = {**RECIPE, "convert": {**RECIPE["convert"], "options": {"station_aliases": {"G大坪林": "大平林"}}}}
    with pytest.raises(ValueError, match="大平林"):
        convert(recipe, files)
