"""Task 8.1: the `netscied` command exists and lists its subcommands."""

import subprocess
import sys


def test_help_lists_every_subcommand():
    out = subprocess.run([sys.executable, "-m", "netscied.cli", "--help"], capture_output=True, text=True, check=True).stdout
    for command in ["fetch", "convert", "stats", "manifest", "upload"]:
        assert command in out


import json

from netscied.cli import main


def test_upload_is_refused_locally(capsys):
    assert main(["upload", "golden-horse-2018-nominations"]) == 2
    assert "nothing was uploaded" in capsys.readouterr().err


def test_fetch_then_manifest_builds_the_golden_horse_version(tmp_path, capsys):
    cache, data, catalog = tmp_path / "cache", tmp_path / "data", tmp_path / "catalog"
    assert main(["fetch", "golden-horse-2018-nominations", "--cache", str(cache), "--no-capture"]) == 0
    assert main(["stats", "golden-horse-2018-nominations", "--cache", str(cache)]) == 0
    stats = json.loads(capsys.readouterr().out.split("\n", 1)[1])
    assert stats["graph"]["repeated_pairs"] == 13
    args = ["manifest", "golden-horse-2018-nominations", "--cache", str(cache), "--data", str(data), "--catalog", str(catalog), "--released", "2026-11-04", "--allow-dirty"]
    assert main(args) == 0
    m = json.loads((catalog / "versions" / "golden-horse-2018-nominations" / "1.0.0.json").read_text(encoding="utf-8"))
    assert m["statistics"]["graph"]["repeated_pairs"] == 13
    assert "13 組" in m["changelog"]["zh-Hant"]
    assert (data / "golden-horse-2018-nominations" / "1.0.0" / "original" / "nominations.csv").is_file()
    # A second run would overwrite a manifest: refused without --force.
    assert main(args) == 1
    assert "immutable" in capsys.readouterr().err
