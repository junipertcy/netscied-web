"""Task 8.3: the 第10屆立法院 co-sponsorship hypergraph from LYAPI pages.

Review finding 11: only 委員提案 bills, and only names on the 10th-term
legislator roster, may reach the hosted files; a petitioner's or any other
non-legislator's name must never appear in them."""

import json

import pytest

from netscied.converters import convert
from netscied.formats import write_hif

ROSTER = [
    {"屆": 10, "委員姓名": "王定宇", "委員英文姓名": "Wang Ting-Yu", "黨籍": "民主進步黨", "黨團": "民主進步黨", "歷屆立法委員編號": 1160, "學歷": ["某大學"]},
    {"屆": 10, "委員姓名": "孔文吉", "委員英文姓名": "Kung Wen-Chi", "黨籍": "中國國民黨", "黨團": "中國國民黨", "歷屆立法委員編號": 999},
    {"屆": 10, "委員姓名": "鄭天財Sra Kacaw", "委員英文姓名": "Sra Kacaw", "黨籍": "中國國民黨", "黨團": "中國國民黨", "歷屆立法委員編號": 1001},
    {"屆": 10, "委員姓名": "未提案委員", "委員英文姓名": "No Bills", "黨籍": "無黨籍", "黨團": "無黨團結聯盟", "歷屆立法委員編號": 1500},
]


def bill(no, date, sponsors, cosigners, source="委員提案", term=10, **kw):
    b = {"屆": term, "議案編號": no, "提案日期": date, "議案名稱": f"議案{no}", "提案單位/提案委員": "本院委員某某等人", "議案類別": "法律案", "提案來源": source, "會期": 3, "url": f"https://ppg.ly.gov.tw/ppg/bills/{no}/details"}
    if sponsors is not None:
        b["提案人"] = sponsors
    if cosigners is not None:
        b["連署人"] = cosigners
    return {**b, **kw}


BILLS = [
    bill("B2", "2021-05-01", ["孔文吉"], ["王定宇", "王小明", "王定宇"]),  # a non-legislator name, and a repeated name
    bill("B1", "2021-03-01", ["王定宇", "鄭天財Sra Kacaw"], ["鄭天財Sra Kacaw", "孔文吉"]),  # one name in both roles
    bill("B3", "2021-06-01", ["時代力量立法院黨團"], None),  # a caucus bill: no roster member
    bill("B4", "2021-07-01", None, None),  # empty lists upstream
    bill("P1", "2021-08-01", ["陳請願"], ["林民眾"], source="請願案"),  # a petition
    bill("T9", "2017-01-01", ["孔文吉"], [], term=9),  # another term
]


@pytest.fixture
def files(tmp_path):
    (tmp_path / "bills").mkdir()
    (tmp_path / "legislators").mkdir()
    pages = [BILLS[:3], BILLS[3:]]
    paths = []
    for i, items in enumerate(pages, 1):
        p = tmp_path / "bills" / f"page-{i:04d}.json"
        p.write_text(json.dumps({"total": len(BILLS), "total_page": 2, "page": i, "bills": items}, ensure_ascii=False), encoding="utf-8")
        paths.append(p)
    roster = tmp_path / "legislators" / "page-0001.json"
    roster.write_text(json.dumps({"total": len(ROSTER), "total_page": 1, "page": 1, "legislators": ROSTER}, ensure_ascii=False), encoding="utf-8")
    return {"bills": paths, "legislators": [roster]}


RECIPE = {"dataset": "ly-bill-cosponsorship-10th", "convert": {"converter": "ly_cosponsorship", "kind": "hypergraph", "options": {"term": 10}}}


def test_only_member_bills_of_the_term_with_roster_members_become_hyperedges(files):
    h = convert(RECIPE, files).hypergraph
    assert list(h.edges) == ["B1", "B2"]  # by date, then number
    assert h.edges["B1"]["title"] == "議案B1"
    assert h.edges["B1"]["date"] == "2021-03-01"
    assert h.edges["B1"]["session"] == 3


def test_finding_11_no_petitioner_or_other_non_legislator_name_reaches_the_hif_file(files, tmp_path):
    p = convert(RECIPE, files)
    out = write_hif(p.hypergraph, tmp_path / "h.hif.json")
    text = out.read_text(encoding="utf-8")
    for name in ["王小明", "陳請願", "林民眾", "時代力量立法院黨團"]:
        assert name not in text, name
    assert "某大學" not in text  # no education or career fields
    names = {a["name"] for a in p.hypergraph.nodes.values()}
    assert names == {"王定宇", "孔文吉", "鄭天財Sra Kacaw", "未提案委員"}


def test_roles_are_kept_once_per_member_and_proposer_wins(files):
    h = convert(RECIPE, files).hypergraph
    inc = [(e, n, a["role"]) for e, n, a in h.incidences]
    assert inc == [("B1", "1160", "proposer"), ("B1", "1001", "proposer"), ("B1", "999", "cosigner"), ("B2", "999", "proposer"), ("B2", "1160", "cosigner")]


def test_nodes_are_roster_members_with_only_name_party_and_caucus(files):
    h = convert(RECIPE, files).hypergraph
    assert list(h.nodes) == ["999", "1001", "1160", "1500"]
    assert h.node_attrs == ["name", "name_en", "party", "caucus"]
    assert h.nodes["1001"] == {"name": "鄭天財Sra Kacaw", "name_en": "Sra Kacaw", "party": "中國國民黨", "caucus": "中國國民黨"}


def test_left_out_bills_and_names_are_counted_in_the_change_note(files):
    p = convert(RECIPE, files)
    zh = " ".join(n["zh-Hant"] for n in p.notes)
    en = " ".join(n["en"] for n in p.notes)
    assert "1 件由黨團提出" in zh
    assert "1 件上游的提案人與連署人名單都是空白" in zh
    assert "2 個不在第10屆立法委員名單上的姓名" in zh  # 王小明, 時代力量立法院黨團 (the petition is not a member bill)
    assert "1 件議案同一人同時列為提案人與連署人" in zh
    assert "caucus" in en and "roster" in en
    for name in ["王小明", "陳請願", "林民眾"]:
        assert name not in zh + en


def test_a_bill_dated_outside_the_term_is_kept_and_noted(files, tmp_path):
    files["bills"][0].write_text(
        json.dumps({"total": 1, "total_page": 1, "page": 1, "bills": [bill("B9", "2013-04-19", ["孔文吉"], [])]}, ensure_ascii=False), encoding="utf-8"
    )
    p = convert(RECIPE, {**files, "bills": files["bills"][:1]})
    assert "B9" in p.hypergraph.edges
    assert any("2013-04-19" in n["zh-Hant"] for n in p.notes)


def test_a_page_missing_bills_fails(files):
    doc = json.loads(files["bills"][0].read_text(encoding="utf-8"))
    doc["total"] = 99
    files["bills"][0].write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")
    with pytest.raises(ValueError, match="total"):
        convert(RECIPE, files)


def test_originals_are_not_republished_when_they_carry_a_non_legislator_name(files):
    recipe = {**RECIPE, "sources": [{"id": "bills", "redistribute_original": True}, {"id": "legislators"}]}
    with pytest.raises(ValueError, match="original"):
        convert(recipe, files)
    # Every name in the pages counts, the petition's too, since originals are republished byte for byte.
    doc = json.loads(files["bills"][0].read_text(encoding="utf-8"))
    doc["bills"][0]["連署人"] = ["王定宇"]
    files["bills"][0].write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")
    with pytest.raises(ValueError, match="original"):
        convert(recipe, files)
    # Caucus names are organisations, not people: originals with only those are fine.
    doc2 = json.loads(files["bills"][1].read_text(encoding="utf-8"))
    doc2["bills"] = [b for b in doc2["bills"] if b["提案來源"] != "請願案"]
    doc2["total"] = doc["total"] = len(doc["bills"]) + len(doc2["bills"])
    files["bills"][1].write_text(json.dumps(doc2, ensure_ascii=False), encoding="utf-8")
    files["bills"][0].write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")
    assert convert(recipe, files).hypergraph.edges
