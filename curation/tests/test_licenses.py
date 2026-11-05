"""Task 8.5: license classes decide what the pipeline may do (data-curation spec,
"License classes decide permitted operations"; content-governance: the personal-data
level overrides every class)."""

import pytest

from netscied.licenses import LicenseRefused, check_recipe, effective_class, license_class


def record(license_id="CC-BY-4.0", basis="license-permits", level="none", **kw):
    return {"id": "d", "license": {"id": license_id}, "redistribution": {"basis": basis}, "personal_data": {"level": level}, **kw}


def recipe(*source_licenses, operations=("convert",)):
    return {"dataset": "d", "operations": list(operations), "sources": [{"id": f"s{i}", "method": "get", **({"license": lic} if lic else {})} for i, lic in enumerate(source_licenses)]}


def test_classes_come_from_the_vocabulary_and_unknown_ids_are_link_only():
    assert license_class("CC-BY-4.0") == "permissive"
    assert license_class("OGDL-Taiwan-1.0") == "permissive"
    assert license_class("ODbL-1.0") == "share-alike"
    assert license_class("CC-BY-NC-4.0") == "non-commercial"
    assert license_class("CC-BY-ND-4.0") == "no-derivatives"
    assert license_class("NOASSERTION") == "link-only"
    assert license_class("LicenseRef-made-up") == "link-only"


def test_the_redistribution_basis_overrides_the_license_class():
    assert effective_class(record(basis="own-work")) == "permissive"
    assert effective_class(record(basis="written-permission")) == "permission"
    assert effective_class(record(basis="link-only")) == "link-only"


def test_permissive_sources_may_be_cleaned_and_subset():
    d = check_recipe(recipe("CC-BY-4.0", operations=("convert", "clean", "subset", "aggregate")), record())
    assert d.cls == "permissive"
    assert d.labels == []


def test_ogdl_derivatives_may_be_released_under_cc_by_4_0_and_must_carry_the_attribution_statement():
    d = check_recipe(recipe("OGDL-Taiwan-1.0", operations=("convert", "aggregate")), record("OGDL-Taiwan-1.0"))
    assert d.requires_ogdl_statement
    d2 = check_recipe(recipe("OGDL-Taiwan-1.0", operations=("convert", "aggregate")), record("CC-BY-4.0"))
    assert d2.requires_ogdl_statement
    with pytest.raises(LicenseRefused, match="OGDL"):
        check_recipe(recipe("OGDL-Taiwan-1.0"), record("CC0-1.0"))


def test_no_derivatives_allows_lossless_conversion_only_with_its_label():
    d = check_recipe(recipe("CC-BY-ND-4.0"), record("CC-BY-ND-4.0"))
    assert "格式轉換，內容未修改" in d.labels
    for op in ("clean", "subset", "aggregate", "merge"):
        with pytest.raises(LicenseRefused, match="no-derivatives"):
            check_recipe(recipe("CC-BY-ND-4.0", operations=("convert", op)), record("CC-BY-ND-4.0"))


def test_share_alike_sources_under_different_licenses_are_never_merged():
    with pytest.raises(LicenseRefused, match="share-alike"):
        check_recipe(recipe("CC-BY-SA-4.0", "ODbL-1.0", operations=("convert", "merge")), record("CC-BY-SA-4.0"))


def test_a_share_alike_derivative_keeps_the_same_license():
    assert check_recipe(recipe("ODbL-1.0", "ODbL-1.0", operations=("merge",)), record("ODbL-1.0")).cls == "share-alike"
    with pytest.raises(LicenseRefused, match="same license"):
        check_recipe(recipe("CC-BY-SA-4.0", operations=("clean",)), record("CC-BY-4.0"))


def test_non_commercial_keeps_its_license_and_gets_the_label():
    d = check_recipe(recipe("CC-BY-NC-4.0", operations=("clean",)), record("CC-BY-NC-4.0"))
    assert "非商業使用" in d.labels
    with pytest.raises(LicenseRefused, match="same license"):
        check_recipe(recipe("CC-BY-NC-4.0"), record("CC-BY-4.0"))


def test_link_only_sources_and_records_are_never_hosted():
    with pytest.raises(LicenseRefused, match="link-only"):
        check_recipe(recipe("NOASSERTION"), record("NOASSERTION"))
    with pytest.raises(LicenseRefused, match="link-only"):
        check_recipe(recipe("CC-BY-4.0"), record(basis="link-only"))


def test_the_personal_data_level_overrides_every_class():
    for level in ("private-individuals", "sensitive"):
        with pytest.raises(LicenseRefused, match="personal-data"):
            check_recipe(recipe("CC0-1.0"), record("CC0-1.0", level=level))
        with pytest.raises(LicenseRefused, match="personal-data"):
            check_recipe(recipe(None), record(basis="own-work", level=level))


def test_own_work_is_released_under_cc_by_or_cc0():
    assert check_recipe(recipe(None), record("CC-BY-4.0", basis="own-work")).cls == "permissive"
    with pytest.raises(LicenseRefused, match="own work"):
        check_recipe(recipe(None), record("CC-BY-NC-4.0", basis="own-work"))


def test_written_permission_needs_a_permission_reference():
    assert check_recipe(recipe("NOASSERTION"), record("NOASSERTION", basis="written-permission") | {"redistribution": {"basis": "written-permission", "permission_ref": "perm-2026-001"}}).cls == "permission"
    with pytest.raises(LicenseRefused, match="permission"):
        check_recipe(recipe("NOASSERTION"), record("NOASSERTION", basis="written-permission"))


def test_the_committed_recipe_passes():
    from netscied.recipes import dataset_record, load_recipe, recipe_path

    r = load_recipe(recipe_path("golden-horse-2018-nominations"))
    assert check_recipe(r, dataset_record(r["dataset"])).cls == "permissive"
