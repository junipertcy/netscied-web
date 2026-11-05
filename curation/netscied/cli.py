"""Command-line entry point: `uv run netscied <command>`."""

import argparse
import sys

from . import __version__


def main(argv=None):
    parser = argparse.ArgumentParser(prog="netscied", description="netscied.tw curation pipeline")
    parser.add_argument("--version", action="version", version=f"netscied {__version__}")
    sub = parser.add_subparsers(dest="command", required=True)
    for name, help_text in [
        ("fetch", "fetch a recipe's upstream sources and check their hashes"),
        ("convert", "convert fetched sources to the canonical formats"),
        ("stats", "compute statistics for a converted version"),
        ("manifest", "write the version manifest, SHA256SUMS, zip, provenance and attribution"),
        ("upload", "upload an approved version to the data bucket (approval-gated)"),
    ]:
        sub.add_parser(name, help=help_text)
    args = parser.parse_args(argv)
    print(f"netscied {args.command}: not implemented yet", file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main())
