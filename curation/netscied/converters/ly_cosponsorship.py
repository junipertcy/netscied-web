"""第10屆立法院委員提案連署超圖 from LYAPI v2 pages (bills and legislators).

Each member-proposed bill of the term is one hyperedge; its members are the
sponsors (提案人, role proposer) and co-signers (連署人, role cosigner) who are on
the term's legislator roster. Review finding 11: nothing else enters the files —
petitions and other bill sources are skipped, a name not on the roster (a
caucus, or anyone else) is never a node, and the roster's own fields are cut to
name, English name, party and caucus. The change note gives counts, never the
left-out names.
"""

from __future__ import annotations

import json
import re
from collections import Counter

from ..formats import Hypergraph
from ..version import Product

# Term dates: LYAPI /legislators?屆=10 gives 到職日 2020/02/01; the term ended 2024-01-31.
TERMS = {10: ("2020-02-01", "2024-01-31")}
MEMBER_BILLS = "委員提案"
# How the LY names a private petitioner in a bill title: 「函，為陳○○君為…」.
PETITIONER = re.compile(r"為[^，。、\s]{1,8}君")


def _bills(n: int) -> str:
    return f"{n} bill" if n == 1 else f"{n} bills"


def _items(paths, key):
    total, items = None, []
    for p in paths:
        doc = json.loads(p.read_text(encoding="utf-8"))
        total = doc.get("total", total) if total is None else total
        items += doc.get(key, [])
    return total, items


def convert(recipe: dict, files: dict, options: dict) -> Product:
    term = int(options.get("term", 10))
    start, end = TERMS.get(term, (None, None))
    total, raw = _items(files["bills"], "bills")
    bills = {b["議案編號"]: b for b in raw}
    if total is not None and len(bills) != int(total):
        raise ValueError(f"LYAPI reported total={total} bills but the pages hold {len(bills)} distinct bills; refetch")
    # Final review D1: the pages must hold member-proposed bills only. LYAPI's
    # petitions (提案來源=請願案) have no name lists and name the petitioner in the
    # title (「函，為○○○君為…」), so the name-list checks below cannot see them.
    others = sorted({str(b.get("提案來源")) for b in bills.values() if b.get("提案來源") != MEMBER_BILLS})
    if others:
        raise ValueError(f"the bill pages hold bills whose 提案來源 is {', '.join(others)}, not only {MEMBER_BILLS}; fetch with 提案來源={MEMBER_BILLS}")
    named = [b["議案編號"] for b in bills.values() if PETITIONER.search(b.get("議案名稱") or "")]
    if named:
        raise ValueError(f"{len(named)} bill titles name a private petitioner (…君); titles are kept verbatim, so these bills cannot be converted: {', '.join(named[:5])}")
    _, roster_items = _items(files["legislators"], "legislators")
    roster = {}
    for m in roster_items:
        if int(m.get("屆", term)) != term:
            continue
        roster[m["委員姓名"]] = str(m["歷屆立法委員編號"])

    h = Hypergraph(node_attrs=["name", "name_en", "party", "caucus"], edge_attrs=["title", "date", "session", "category", "sponsor_text", "url"], incidence_attrs=["role"])
    for m in sorted(roster_items, key=lambda m: int(m["歷屆立法委員編號"])):
        if int(m.get("屆", term)) == term:
            h.add_node(str(m["歷屆立法委員編號"]), name=m["委員姓名"], name_en=m.get("委員英文姓名"), party=m.get("黨籍"), caucus=m.get("黨團"))

    left_out = Counter()
    unknown_names: set[str] = set()
    out_of_term: list[str] = []
    member_bills = [b for b in bills.values() if b.get("提案來源") == MEMBER_BILLS and int(b.get("屆", -1)) == term]
    for b in sorted(member_bills, key=lambda b: (b.get("提案日期") or "", b["議案編號"])):
        sponsors, cosigners = b.get("提案人") or [], b.get("連署人") or []
        names = sponsors + cosigners
        if len(set(sponsors)) != len(sponsors) or len(set(cosigners)) != len(cosigners):
            left_out["repeated_in_list"] += 1
        if set(sponsors) & set(cosigners):
            left_out["both_roles"] += 1
        unknown = {n for n in names if n not in roster}
        unknown_names |= unknown
        members = []
        for role, group in (("proposer", sponsors), ("cosigner", cosigners)):
            for n in group:
                if n in roster and roster[n] not in {x for x, _ in members}:
                    members.append((roster[n], role))
        if not names:
            left_out["empty"] += 1
            continue
        if not members:
            left_out["caucus_only" if all(n.endswith("黨團") for n in names) else "no_roster_member"] += 1
            continue
        date = b.get("提案日期")
        if start and date and not (start <= date <= end):
            out_of_term.append(date)
        h.add_edge(b["議案編號"], title=b.get("議案名稱"), date=date, session=b.get("會期"), category=b.get("議案類別"), sponsor_text=b.get("提案單位/提案委員"), url=b.get("url"))
        for node, role in members:
            h.add_incidence(b["議案編號"], node, role=role)

    # The original pages are republished byte for byte when the recipe asks for
    # it, so they must not carry anyone's name but legislators and caucuses.
    if any(s.get("redistribute_original") for s in recipe.get("sources", []) if s.get("id") == "bills"):
        people = {n for b in bills.values() for n in (b.get("提案人") or []) + (b.get("連署人") or []) if n not in roster and not n.endswith("黨團")}
        if people:
            raise ValueError(f"the original bill pages carry {len(people)} names that are neither on the term-{term} roster nor caucuses; set redistribute_original: false for the bills source")
        # 提案單位/提案委員 names a body of the LY itself: 本院委員…, 本院…黨團, 本院…委員會.
        outside = [b["議案編號"] for b in bills.values() if (b.get("提案單位/提案委員") or "") and not str(b.get("提案單位/提案委員")).startswith("本院")]
        if outside:
            raise ValueError(f"the original bill pages carry {len(outside)} 提案單位/提案委員 values that are not a body of the Legislative Yuan (本院…); set redistribute_original: false for the bills source")

    notes = []
    if left_out["caucus_only"]:
        notes.append({"zh-Hant": f"{left_out['caucus_only']} 件由黨團提出、沒有個別委員列名的議案不收錄。", "en": f"{_bills(left_out['caucus_only'])} filed by a caucus with no individual legislator listed {'is' if left_out['caucus_only'] == 1 else 'are'} left out."})
    if left_out["no_roster_member"]:
        notes.append({"zh-Hant": f"{left_out['no_roster_member']} 件議案的列名者都不在第{term}屆立法委員名單上，不收錄。", "en": f"{_bills(left_out['no_roster_member'])} listing no one on the term-{term} roster {'is' if left_out['no_roster_member'] == 1 else 'are'} left out."})
    if left_out["empty"]:
        notes.append({"zh-Hant": f"{left_out['empty']} 件上游的提案人與連署人名單都是空白，不收錄。", "en": f"{_bills(left_out['empty'])} with empty sponsor and co-signer lists upstream {'is' if left_out['empty'] == 1 else 'are'} left out."})
    if unknown_names:
        caucus = sum(1 for n in unknown_names if n.endswith("黨團"))
        notes.append({"zh-Hant": f"{len(unknown_names)} 個不在第{term}屆立法委員名單上的姓名（其中 {caucus} 個是黨團）未列為超邊成員。", "en": f"{len(unknown_names)} names not on the term-{term} legislator roster ({caucus} of them caucuses) are not members of any hyperedge."})
    if left_out["both_roles"]:
        notes.append({"zh-Hant": f"{left_out['both_roles']} 件議案同一人同時列為提案人與連署人，只保留提案人角色。", "en": f"In {_bills(left_out['both_roles'])}, one legislator is listed as both sponsor and co-signer; only the sponsor role is kept."})
    if left_out["repeated_in_list"]:
        notes.append({"zh-Hant": f"{left_out['repeated_in_list']} 件議案的名單中有重複姓名，各只算一次。", "en": f"In {_bills(left_out['repeated_in_list'])}, a name repeats within a list; it counts once."})
    if out_of_term:
        dates = "、".join(sorted(set(out_of_term)))
        notes.append({"zh-Hant": f"{len(out_of_term)} 件議案的提案日期不在第{term}屆任期內（{dates}），照上游資料保留。", "en": f"{_bills(len(out_of_term))} with a 提案日期 outside the term ({dates}) {'is' if len(out_of_term) == 1 else 'are'} kept as upstream gives {'it' if len(out_of_term) == 1 else 'them'}."})
    return Product(kind="hypergraph", hypergraph=h, notes=notes)
