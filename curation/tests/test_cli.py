"""Task 8.1: the `netscied` command exists and lists its subcommands."""

import subprocess
import sys


def test_help_lists_every_subcommand():
    out = subprocess.run([sys.executable, "-m", "netscied.cli", "--help"], capture_output=True, text=True, check=True).stdout
    for command in ["fetch", "convert", "stats", "manifest", "upload"]:
        assert command in out
