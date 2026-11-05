"""臺北捷運站間起訖月彙總 from the hourly upstream files, one per month
(臺北捷運每日分時各站OD流量統計資料_YYYYMM.csv: UTF-8 with BOM, CRLF,
header 日期,時段,進站,出站,人次).

The hourly 人次 counts are summed per (month, entry station, exit station);
each month is one snapshot (edge column `month`). Pairs whose monthly sum is 0
are not listed. Station names are kept as the source gives them, unless the
recipe lists `station_aliases`; each station is marked by the side it appears
on (entry, exit or both), because the source names some stations differently
on the two sides.
"""

from __future__ import annotations

import csv
import re
from collections import defaultdict

from ..formats import Graph
from ..version import Product

HEADER = ["日期", "時段", "進站", "出站", "人次"]
OVERNIGHT_END = 6  # service hours start again at 06:00


def _next_month_first(month: str) -> str:
    y, m = (int(x) for x in month.split("-"))
    return f"{y + (m == 12)}-{m % 12 + 1:02d}-01"
SOURCE = re.compile(r"^od-(\d{4})-(\d{2})$")


def convert(recipe: dict, files: dict, options: dict) -> Product:
    aliases = options.get("station_aliases") or {}
    trips: dict[tuple[str, str, str], int] = defaultdict(int)
    entries: set[str] = set()
    exits: set[str] = set()
    raw: set[str] = set()
    overnight: dict[tuple[str, str], int] = defaultdict(int)
    months = sorted((f"{m.group(1)}-{m.group(2)}", sid) for sid in files if (m := SOURCE.match(sid)))
    if not months:
        raise ValueError("no monthly sources (od-YYYY-MM) to convert")
    for month, sid in months:
        for path in files[sid]:
            with open(path, encoding="utf-8-sig", newline="") as f:
                reader = csv.reader(f)
                header = next(reader, None)
                if header != HEADER:
                    raise ValueError(f"{path.name}: unexpected header {header}; expected {HEADER}")
                for row in reader:
                    if not row:
                        continue
                    date, hour, a, b, n = row
                    if date[:7] != month:
                        # All-night service (for example New Year's Eve) is filed under the
                        # operating day: the first morning of the next month, before 06:00,
                        # belongs to this file's month and is not repeated in the next file.
                        if date == _next_month_first(month) and int(hour) < OVERNIGHT_END:
                            overnight[(month, date)] += int(n)
                        else:
                            raise ValueError(f"{path.name}: a row dated {date} {hour}:00 in the file for {month}")
                    raw.update((a, b))
                    a, b = aliases.get(a, a), aliases.get(b, b)
                    entries.add(a)
                    exits.add(b)
                    trips[(month, a, b)] += int(n)
    for alias, target in aliases.items():
        if target not in raw:
            raise ValueError(f"station_aliases maps {alias} to {target}, which is not a station name in the files")
    g = Graph(directed=True, node_attrs=["appears_as"], edge_attrs=["month", "trips"], multi=True)
    for name in sorted(entries | exits):
        g.add_node(name, appears_as="both" if name in entries and name in exits else ("entry" if name in entries else "exit"))
    for (month, a, b), n in sorted(trips.items()):
        if n:
            g.add_edge(a, b, month=month, trips=n)
    entry_only, exit_only = sorted(entries - exits), sorted(exits - entries)
    notes = [
        {
            "zh-Hant": f"{len(g.nodes)} 個車站名稱照原始資料保留；{len(entry_only)} 個只出現在進站欄，{len(exit_only)} 個只出現在出站欄（節點屬性 appears_as）。",
            "en": f"{len(g.nodes)} station names are kept as the source gives them; {len(entry_only)} appear only as entries and {len(exit_only)} only as exits (node attribute appears_as).",
        }
    ]
    for (month, date), n in sorted(overnight.items()):
        notes.append(
            {
                "zh-Hant": f"{month} 的檔案含 {date} 凌晨（6 時前）的通宵營運旅次 {n:,} 人次，依原始檔計入 {month}。",
                "en": f"The {month} file carries {n:,} trips from {date} before 06:00 (all-night service); they count for {month}, as the source files them.",
            }
        )
    return Product(kind="graph", graph=g, weight="trips", notes=notes, snapshot="month")
