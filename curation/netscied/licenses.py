"""License classes and what each permits (design D3; data-curation spec, "License
classes decide permitted operations").

The class of a license id comes from catalog/vocab/licenses.yaml, the same table
the site build reads (scripts/catalog/lib/licenses.mjs); an id not listed counts
as link-only. A record's redistribution basis can override the class
(own-work → permissive, written-permission → permission, link-only → link-only),
and a personal-data level of private-individuals or sensitive overrides all of
them (content-governance spec).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from functools import lru_cache

from .recipes import REPO, load_yaml

HOSTABLE = {"permissive", "share-alike", "non-commercial", "no-derivatives", "permission"}
OWN_WORK_LICENSES = {"CC-BY-4.0", "CC0-1.0"}
OGDL = "OGDL-Taiwan-1.0"
# OGDL §4(2): one-way compatible with CC BY 4.0, with the 顯名聲明 preserved.
OGDL_DERIVATIVE_LICENSES = {OGDL, "CC-BY-4.0"}
LOSSLESS = {"convert"}
NO_PERSONAL_HOSTING = {"private-individuals", "sensitive"}


class LicenseRefused(ValueError):
    pass


@lru_cache(maxsize=1)
def _vocab() -> dict:
    return {e["id"]: e for e in load_yaml(REPO / "catalog" / "vocab" / "licenses.yaml")}


def license_entry(license_id: str) -> dict | None:
    return _vocab().get(license_id)


def license_class(license_id: str | None) -> str:
    entry = _vocab().get(license_id or "")
    return entry["class"] if entry else "link-only"


def effective_class(record: dict) -> str:
    basis = (record.get("redistribution") or {}).get("basis")
    if basis == "written-permission":
        return "permission"
    if basis == "own-work":
        return "permissive"
    if basis == "link-only":
        return "link-only"
    return license_class((record.get("license") or {}).get("id"))


@dataclass
class Decision:
    cls: str
    labels: list[str] = field(default_factory=list)
    requires_ogdl_statement: bool = False
    source_licenses: list[str] = field(default_factory=list)


def check_recipe(recipe: dict, record: dict) -> Decision:
    """Raises LicenseRefused unless the recipe's operations are permitted for the
    record and every source; returns the class and the labels the page must show."""
    did = record.get("id", recipe.get("dataset"))
    level = (record.get("personal_data") or {}).get("level")
    if level in NO_PERSONAL_HOSTING:
        raise LicenseRefused(f"{did}: personal-data level {level} forbids hosting files, whatever the license (content-governance spec)")

    basis = (record.get("redistribution") or {}).get("basis")
    out_license = (record.get("license") or {}).get("id")
    cls = effective_class(record)
    ops = set(recipe.get("operations") or ["convert"])
    if cls == "link-only":
        raise LicenseRefused(f"{did}: the record is link-only, so the site may keep metadata and links but host no files")

    if basis == "own-work":
        if out_license not in OWN_WORK_LICENSES:
            raise LicenseRefused(f"{did}: the site's own work is released under {sorted(OWN_WORK_LICENSES)}, not {out_license}")
        return Decision(cls="permissive")

    if cls == "permission":
        if not (record.get("redistribution") or {}).get("permission_ref"):
            raise LicenseRefused(f"{did}: written-permission needs a permission_ref to the private researcher log")
        return Decision(cls="permission")

    source_licenses = [s.get("license") or out_license for s in recipe.get("sources", [])]
    source_classes = {lic: license_class(lic) for lic in source_licenses}
    for lic, c in source_classes.items():
        if c == "link-only":
            raise LicenseRefused(f"{did}: source license {lic} is link-only; its data cannot be hosted")

    labels: list[str] = []
    sa = sorted({lic for lic, c in source_classes.items() if c == "share-alike"})
    if len(sa) > 1:
        raise LicenseRefused(f"{did}: sources under different share-alike licenses ({', '.join(sa)}) are never merged into one dataset")
    if sa and out_license != sa[0]:
        raise LicenseRefused(f"{did}: a share-alike derivative keeps the same license ({sa[0]}), not {out_license}")

    nc = sorted({lic for lic, c in source_classes.items() if c == "non-commercial"})
    if nc:
        if len(set(source_licenses)) > 1 or out_license != nc[0]:
            raise LicenseRefused(f"{did}: a non-commercial source keeps the same license ({nc[0]}), not {out_license}")
        labels.append("非商業使用")

    nd = sorted({lic for lic, c in source_classes.items() if c == "no-derivatives"})
    if nd:
        changed = sorted(ops - LOSSLESS)
        if changed:
            raise LicenseRefused(f"{did}: {nd[0]} is no-derivatives, so only lossless conversion is allowed, not {', '.join(changed)}")
        if out_license != nd[0]:
            raise LicenseRefused(f"{did}: a no-derivatives source keeps its license ({nd[0]})")
        labels.append("格式轉換，內容未修改")

    ogdl = OGDL in source_licenses
    if ogdl and out_license not in OGDL_DERIVATIVE_LICENSES:
        raise LicenseRefused(f"{did}: OGDL-Taiwan-1.0 data may be released as {sorted(OGDL_DERIVATIVE_LICENSES)} only, not {out_license}")
    if not (sa or nc or nd or ogdl) and license_class(out_license) == "link-only":
        raise LicenseRefused(f"{did}: the record's license {out_license} is link-only")

    order = ["no-derivatives", "non-commercial", "share-alike", "permissive"]
    worst = next(c for c in order if c in source_classes.values() or c == "permissive")
    return Decision(cls=worst, labels=labels, requires_ogdl_statement=ogdl, source_licenses=source_licenses)
